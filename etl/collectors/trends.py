"""
Google Trends collector — fetches search interest data via pytrends.

Queries interest_over_time for each model's search aliases,
aggregates by taking the max interest across aliases per day,
and computes a 7-day rolling average.
"""

import logging
import random
import time
from datetime import date, timedelta
from typing import Any

import pandas as pd
from pytrends.request import TrendReq

from .base import BaseCollector

logger = logging.getLogger(__name__)

# Max retries for 429 rate-limit errors
MAX_429_RETRIES = 3
INITIAL_BACKOFF_SECS = 10


class TrendsCollector(BaseCollector):
    """Collects Google Trends interest data for AI models."""

    source_name: str = "trends"

    def __init__(self, timeout: tuple[int, int] = (10, 30)):
        super().__init__()
        self._timeout = timeout

    def _new_pytrends(self) -> TrendReq:
        """Create a fresh TrendReq instance (resets session cookies)."""
        return TrendReq(
            hl="en-US",
            tz=360,
            timeout=self._timeout,
        )

    def _fetch_batch_with_retry(self, batch: list[str]) -> pd.DataFrame | None:
        """
        Fetch interest_over_time for a batch of keywords.
        Retries with exponential backoff on 429 rate-limit errors,
        creating a fresh session each time.
        """
        for attempt in range(MAX_429_RETRIES):
            try:
                pt = self._new_pytrends()
                pt.build_payload(
                    kw_list=batch,
                    cat=0,
                    timeframe="now 7-d",
                    geo="",
                )
                df = pt.interest_over_time()

                if df.empty:
                    self.logger.warning(f"Empty trends data for batch {batch}")
                    return None

                if "isPartial" in df.columns:
                    df = df.drop(columns=["isPartial"])

                return df

            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg:
                    backoff = INITIAL_BACKOFF_SECS * (2 ** attempt) + random.uniform(1, 5)
                    self.logger.warning(
                        f"Rate limited (429) on batch {batch}, "
                        f"retry {attempt + 1}/{MAX_429_RETRIES} in {backoff:.0f}s"
                    )
                    time.sleep(backoff)
                else:
                    self.logger.error(f"Trends fetch failed for batch {batch}: {e}")
                    return None

        self.logger.error(f"All 429 retries exhausted for batch {batch}")
        return None

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Google Trends interest for a model.

        Queries interest_over_time for aliases (batched in groups of 5,
        the pytrends max). Takes the max interest value per day across
        all aliases, then computes a 7-day rolling average.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt')
            aliases: List of search terms (e.g., ['ChatGPT', 'GPT-4o'])

        Returns:
            Result dict with metrics: {interest, interest_7d_avg}
            or None on failure.
        """
        if not aliases:
            self.logger.warning(f"No aliases for {model_slug}, skipping trends fetch")
            return None

        self.logger.info(f"Fetching trends for {model_slug} with {len(aliases)} aliases")

        all_frames: list[pd.DataFrame] = []

        # pytrends allows max 5 keywords per request
        batches = [aliases[i:i + 5] for i in range(0, len(aliases), 5)]

        for i, batch in enumerate(batches):
            # Delay between batches (not before first)
            if i > 0:
                delay = random.uniform(2.0, 5.0)
                self.logger.debug(f"Sleeping {delay:.1f}s between batches")
                time.sleep(delay)

            df = self._fetch_batch_with_retry(batch)
            if df is not None:
                all_frames.append(df)

        if not all_frames:
            self.logger.error(f"All trends batches failed for {model_slug}")
            return None

        # Combine all batches, take max interest across aliases per timestamp
        combined = pd.concat(all_frames, axis=1)
        max_per_timestamp = combined.max(axis=1)

        # Current interest: latest value
        interest = float(max_per_timestamp.iloc[-1])

        # 7-day average: mean of all hourly values (covers ~7 days)
        interest_7d_avg = float(max_per_timestamp.mean())

        # Daily aggregates for raw_json debug info
        daily_agg = max_per_timestamp.resample("D").max()
        raw_daily = {
            dt.strftime("%Y-%m-%d"): float(val)
            for dt, val in daily_agg.items()
            if not pd.isna(val)
        }

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "interest": round(interest, 2),
                "interest_7d_avg": round(interest_7d_avg, 2),
            },
        )
        result["raw_json"] = {
            "aliases_queried": aliases,
            "daily_max": raw_daily,
            "num_datapoints": len(max_per_timestamp),
        }

        self.logger.info(
            f"Trends for {model_slug}: interest={interest:.1f}, 7d_avg={interest_7d_avg:.1f}"
        )
        return result
