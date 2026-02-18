"""
Wikipedia Pageviews collector — fetches daily pageview counts from Wikimedia REST API.

Replaces the Polymarket (M) component with actual data.
Wikipedia pageviews measure "mindshare" — how many people are actively reading
about an AI model, which correlates with public interest and adoption consideration.

API docs: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/
No authentication required. No rate limit enforced (be respectful: 1 req/sec).

Metrics collected:
- pageviews_7d: Total pageviews over the last 7 days
- pageviews_daily_avg: Average daily pageviews (7d)
"""

import logging
import time
from datetime import date, timedelta
from typing import Any

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

# Wikimedia Pageviews REST API
WIKIMEDIA_API_BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
REQUEST_DELAY_SECS = 1.0  # Be respectful to Wikimedia


class WikipediaCollector(BaseCollector):
    """Collects Wikipedia pageview data for AI models."""

    source_name: str = "wikipedia"

    def __init__(self, timeout: int = 15):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0 (research aggregator; https://aiviralityindex.com)",
            "Accept": "application/json",
        })

    def _fetch_pageviews(
        self,
        article_title: str,
        days: int = 7,
    ) -> list[dict] | None:
        """
        Fetch daily pageviews for a Wikipedia article.

        Args:
            article_title: Wikipedia article title (use underscores for spaces,
                          e.g., 'ChatGPT', 'Claude_(language_model)').
            days: Number of days to fetch (default 7).

        Returns:
            List of dicts with 'timestamp' and 'views', or None on failure.
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # Wikimedia API date format: YYYYMMDD
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")

        url = (
            f"{WIKIMEDIA_API_BASE}/en.wikipedia/all-access/user"
            f"/{article_title}/daily/{start_str}/{end_str}"
        )

        try:
            resp = self._session.get(url, timeout=self._timeout)

            if resp.status_code == 404:
                self.logger.warning(
                    f"Wikipedia article not found: '{article_title}'. "
                    f"Check the article title in models_config.yaml."
                )
                return None

            if resp.status_code != 200:
                self.logger.warning(
                    f"Wikimedia API returned {resp.status_code} for '{article_title}'"
                )
                return None

            data = resp.json()
            items = data.get("items", [])

            if not items:
                self.logger.warning(f"No pageview data returned for '{article_title}'")
                return None

            return items

        except requests.RequestException as e:
            self.logger.error(f"Wikimedia API error for '{article_title}': {e}")
            return None

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Wikipedia pageview data for a model.

        The first alias should be the exact Wikipedia article title.
        Additional aliases are tried as fallbacks if the first fails.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of Wikipedia article titles to try.
                    First one is primary (e.g., 'ChatGPT').

        Returns:
            Result dict with metrics: {pageviews_7d, pageviews_daily_avg}
            or None on failure.
        """
        if not aliases:
            self.logger.warning(
                f"No Wikipedia article title configured for {model_slug}, "
                f"skipping Wikipedia fetch"
            )
            return None

        self.logger.info(
            f"Fetching Wikipedia pageviews for {model_slug} "
            f"(article: {aliases[0]})"
        )

        # Try each alias (article title) until one works
        items = None
        used_article = None
        for article_title in aliases:
            items = self._fetch_pageviews(article_title, days=7)
            if items:
                used_article = article_title
                break
            time.sleep(REQUEST_DELAY_SECS)

        if not items:
            self.logger.warning(
                f"All Wikipedia article titles failed for {model_slug}: {aliases}"
            )
            # Return zeros (graceful degradation, like Polymarket did)
            result = self.make_result(
                model_slug=model_slug,
                metrics={
                    "pageviews_7d": 0,
                    "pageviews_daily_avg": 0.0,
                },
            )
            result["raw_json"] = {
                "articles_tried": aliases,
                "matched_article": None,
                "error": "no data returned",
            }
            return result

        # Aggregate pageviews
        daily_views = [item.get("views", 0) for item in items]
        total_7d = sum(daily_views)
        daily_avg = total_7d / len(daily_views) if daily_views else 0.0

        # Build daily breakdown for debugging
        daily_breakdown = {}
        for item in items:
            ts = item.get("timestamp", "")
            # Timestamp format: "2026021000" -> "2026-02-10"
            if len(ts) >= 8:
                day_str = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
                daily_breakdown[day_str] = item.get("views", 0)

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "pageviews_7d": total_7d,
                "pageviews_daily_avg": round(daily_avg, 1),
            },
        )
        result["raw_json"] = {
            "articles_tried": aliases,
            "matched_article": used_article,
            "days_fetched": len(daily_views),
            "daily_views": daily_breakdown,
        }

        self.logger.info(
            f"Wikipedia for {model_slug}: "
            f"7d_total={total_7d:,}, daily_avg={daily_avg:,.0f} "
            f"(article: {used_article})"
        )
        return result
