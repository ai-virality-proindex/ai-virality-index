"""
Hacker News collector — fetches story/comment activity via the HN Algolia API.

Uses the free HN Search API (hn.algolia.com) to find stories and comments
mentioning each AI model in the last 24 hours. No API key required.

Metrics collected:
- stories_24h: number of stories mentioning the model
- comments_24h: number of comments mentioning the model
- total_points: sum of points across matching stories
- top_story_points: highest-scoring story's points
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_SEARCH_DATE_URL = "https://hn.algolia.com/api/v1/search_by_date"

# Delay between API calls to be respectful
REQUEST_DELAY_SECS = 1.0


class HackerNewsCollector(BaseCollector):
    """Collects Hacker News discussion activity for AI models."""

    source_name: str = "hackernews"

    def __init__(self, timeout: int = 15):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0 (research aggregator)",
        })

    def _search_hn(
        self,
        query: str,
        tags: str,
        created_after: int,
    ) -> list[dict]:
        """
        Search HN Algolia API.

        Args:
            query: Search query string.
            tags: HN tags filter (e.g., 'story', 'comment').
            created_after: Unix timestamp — only return items created after this.

        Returns:
            List of hit dicts from the API.
        """
        all_hits: list[dict] = []
        page = 0
        max_pages = 5  # safety limit

        while page < max_pages:
            params = {
                "query": query,
                "tags": tags,
                "numericFilters": f"created_at_i>{created_after}",
                "hitsPerPage": 200,
                "page": page,
            }

            try:
                resp = self._session.get(
                    HN_SEARCH_DATE_URL,
                    params=params,
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                data = resp.json()
            except requests.RequestException as e:
                self.logger.warning(f"HN API request failed (page {page}): {e}")
                break

            hits = data.get("hits", [])
            all_hits.extend(hits)

            # Check if there are more pages
            nb_pages = data.get("nbPages", 0)
            if page + 1 >= nb_pages:
                break

            page += 1
            time.sleep(REQUEST_DELAY_SECS * 0.5)

        return all_hits

    def _fetch_for_query(
        self,
        query: str,
        since_ts: int,
    ) -> dict[str, Any]:
        """
        Fetch HN stories and comments for a single search query.

        Returns:
            Dict with stories_count, comments_count, total_points, top_points.
        """
        # Fetch stories
        stories = self._search_hn(query, tags="story", created_after=since_ts)
        time.sleep(REQUEST_DELAY_SECS)

        # Fetch comments
        comments = self._search_hn(query, tags="comment", created_after=since_ts)

        # Calculate metrics
        story_points = [h.get("points", 0) or 0 for h in stories]
        total_points = sum(story_points)
        top_points = max(story_points) if story_points else 0

        return {
            "stories_count": len(stories),
            "comments_count": len(comments),
            "total_points": total_points,
            "top_points": top_points,
        }

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Hacker News activity for a model.

        Searches for each alias in the last 24 hours, aggregates results
        (takes max across aliases to avoid double-counting overlapping terms).

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of search terms (e.g., ['ChatGPT', 'GPT-4o']).

        Returns:
            Result dict with metrics or None on complete failure.
        """
        if not aliases:
            self.logger.warning(f"No aliases for {model_slug}, skipping HN fetch")
            return None

        self.logger.info(
            f"Fetching HN data for {model_slug} with {len(aliases)} aliases"
        )

        # 24 hours ago as unix timestamp
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        since_ts = int(since.timestamp())

        # Aggregate across aliases: use the combined OR query for efficiency
        # HN Algolia supports OR via space-separated terms in quotes
        # But for accuracy, we query each alias separately and take the max
        best = {
            "stories_count": 0,
            "comments_count": 0,
            "total_points": 0,
            "top_points": 0,
        }
        all_failed = True
        raw_per_alias: dict[str, dict] = {}

        for i, alias in enumerate(aliases):
            if i > 0:
                time.sleep(REQUEST_DELAY_SECS)

            try:
                result = self._fetch_for_query(alias, since_ts)
                raw_per_alias[alias] = result
                all_failed = False

                # Take max of each metric across aliases
                for key in best:
                    best[key] = max(best[key], result[key])

            except Exception as e:
                self.logger.warning(f"HN fetch failed for alias '{alias}': {e}")

        if all_failed:
            self.logger.error(f"All HN fetches failed for {model_slug}")
            return None

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "stories_24h": best["stories_count"],
                "comments_24h": best["comments_count"],
                "total_points": best["total_points"],
                "top_story_points": best["top_points"],
            },
        )
        result["raw_json"] = {
            "aliases_queried": aliases,
            "since_utc": since.isoformat(),
            "per_alias": raw_per_alias,
        }

        self.logger.info(
            f"HN for {model_slug}: stories={best['stories_count']}, "
            f"comments={best['comments_count']}, "
            f"top_points={best['top_points']}"
        )
        return result
