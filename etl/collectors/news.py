"""
News collector — fetches article counts and sentiment via GDELT DOC API.

Uses the free GDELT DOC 2.0 API to find news articles mentioning each
AI model in the last 24 hours. No API key required.

Metrics collected:
- article_count: number of articles mentioning the model in last 24h
- source_count: number of unique news sources
- avg_tone: average tone across articles (negative = critical, positive = favorable)

GDELT tone scale: roughly -10 (very negative) to +10 (very positive),
with most articles falling between -5 and +5.
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
REQUEST_DELAY_SECS = 6.0  # GDELT enforces 1 request per 5 seconds


class GDELTNewsCollector(BaseCollector):
    """Collects news article activity for AI models via GDELT."""

    source_name: str = "gdelt"

    def __init__(self, timeout: int = 30):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0 (research aggregator)",
        })

    def _query_gdelt(self, query: str) -> dict[str, Any] | None:
        """
        Query GDELT DOC API for articles matching the query in last 24h.

        Args:
            query: GDELT query string (e.g., '"ChatGPT" OR "OpenAI GPT"')

        Returns:
            Parsed JSON response or None on failure.
        """
        params = {
            "query": f"{query} sourcelang:english",
            "mode": "ArtList",
            "maxrecords": "250",
            "format": "json",
            "timespan": "72h",
        }

        # Retry up to 3 times with exponential backoff for 429s
        for attempt in range(3):
            try:
                resp = self._session.get(
                    GDELT_DOC_API,
                    params=params,
                    timeout=self._timeout,
                )

                if resp.status_code == 429:
                    wait = (attempt + 1) * 5
                    self.logger.warning(
                        f"GDELT rate limited (429), waiting {wait}s (attempt {attempt+1}/3)"
                    )
                    time.sleep(wait)
                    continue

                resp.raise_for_status()

                # GDELT returns empty body or non-JSON when no results
                text = resp.text.strip()
                if not text or text.startswith("<!"):
                    return None

                return resp.json()

            except requests.exceptions.JSONDecodeError:
                self.logger.warning(f"GDELT returned non-JSON for query: {query}")
                return None
            except requests.RequestException as e:
                if attempt < 2:
                    wait = (attempt + 1) * 5
                    self.logger.warning(f"GDELT API error: {e}, retrying in {wait}s")
                    time.sleep(wait)
                else:
                    self.logger.warning(f"GDELT API error after 3 attempts: {e}")
                    return None

        return None

    def _query_gdelt_tone(self, query: str) -> float | None:
        """
        Query GDELT for average tone using tonechart mode.

        Args:
            query: GDELT query string.

        Returns:
            Average tone float or None on failure.
        """
        params = {
            "query": f"{query} sourcelang:english",
            "mode": "ToneChart",
            "format": "json",
            "timespan": "72h",
        }

        try:
            resp = self._session.get(
                GDELT_DOC_API,
                params=params,
                timeout=self._timeout,
            )
            resp.raise_for_status()

            text = resp.text.strip()
            if not text or text.startswith("<!"):
                return None

            data = resp.json()
            # tonechart returns list of {date, bin, count} or similar
            # Try to extract an average from the data
            if isinstance(data, dict) and "tonechart" in data:
                entries = data["tonechart"]
                if entries:
                    tones = []
                    counts = []
                    for entry in entries:
                        tone = entry.get("bin", 0)
                        count = entry.get("count", 0)
                        tones.append(float(tone) * int(count))
                        counts.append(int(count))
                    if sum(counts) > 0:
                        return round(sum(tones) / sum(counts), 2)

            return None

        except (requests.RequestException, ValueError, KeyError) as e:
            self.logger.warning(f"GDELT tone query failed: {e}")
            return None

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch news data for a model from GDELT.

        Combines aliases into an OR query for GDELT.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of GDELT search terms (e.g., ['ChatGPT', 'OpenAI GPT']).

        Returns:
            Result dict with metrics or None on complete failure.
        """
        if not aliases:
            self.logger.warning(f"No GDELT aliases for {model_slug}, skipping")
            return None

        self.logger.info(
            f"Fetching GDELT news for {model_slug} with {len(aliases)} aliases"
        )

        # Build OR query: ("term1" OR "term2" OR ...)
        # GDELT requires OR'd terms to be wrapped in parentheses
        if len(aliases) > 1:
            query = "(" + " OR ".join(f'"{alias}"' for alias in aliases) + ")"
        else:
            query = f'"{aliases[0]}"'

        # Step 1: Get article list (72h window, then filter to last 24h)
        data = self._query_gdelt(query)

        all_articles = []
        if data and "articles" in data:
            all_articles = data["articles"]

        # Filter to last 24h by seendate (format: "20260218T191500Z")
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        articles = []
        for art in all_articles:
            seendate = art.get("seendate", "")
            if seendate:
                try:
                    dt = datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").replace(
                        tzinfo=timezone.utc
                    )
                    if dt >= cutoff:
                        articles.append(art)
                except ValueError:
                    articles.append(art)  # include if date unparseable
            else:
                articles.append(art)

        article_count = len(articles)

        # Count unique source domains
        sources = set()
        for art in articles:
            domain = art.get("domain", "")
            if domain:
                sources.add(domain)
        source_count = len(sources)

        # Step 2: Get average tone
        time.sleep(REQUEST_DELAY_SECS)
        avg_tone = self._query_gdelt_tone(query)

        # If tonechart failed, compute from article tones if available
        if avg_tone is None and articles:
            tones = []
            for art in articles:
                tone = art.get("tone", None)
                if tone is not None:
                    try:
                        tones.append(float(tone))
                    except (ValueError, TypeError):
                        pass
            if tones:
                avg_tone = round(sum(tones) / len(tones), 2)

        if avg_tone is None:
            avg_tone = 0.0  # neutral fallback

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "article_count": article_count,
                "source_count": source_count,
                "avg_tone": avg_tone,
            },
        )
        result["raw_json"] = {
            "aliases_queried": aliases,
            "query": query,
            "article_count": article_count,
            "source_count": source_count,
            "sample_sources": list(sources)[:10],
        }

        self.logger.info(
            f"GDELT for {model_slug}: articles={article_count}, "
            f"sources={source_count}, tone={avg_tone:.2f}"
        )
        return result
