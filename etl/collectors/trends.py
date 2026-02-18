"""
Google Trends collector — fetches search interest data via pytrends.

Queries interest_over_time for each model's search aliases,
aggregates by taking the max interest across aliases per day,
and computes a 7-day rolling average.

Fallback chain:
1. pytrends — primary source
2. trendspy — alternative endpoint when pytrends is 429'd
3. Upstash Redis cache — if all live sources fail, return cached data

On success: cache result to Redis (24h TTL) for resilience.
"""

import logging
import random
import time
from datetime import date, timedelta
from typing import Any

import pandas as pd
from pytrends.request import TrendReq

from .base import BaseCollector
from etl.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# Max retries for 429 rate-limit errors
MAX_429_RETRIES = 3
INITIAL_BACKOFF_SECS = 10

# Cache TTL: 24 hours
CACHE_TTL_SECS = 86400


class TrendsCollector(BaseCollector):
    """Collects Google Trends interest data for AI models."""

    source_name: str = "trends"

    def __init__(self, timeout: tuple[int, int] = (10, 30)):
        super().__init__()
        self._timeout = timeout
        self._pytrends_blocked = False  # Track if pytrends is 429'd this session

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
        self._pytrends_blocked = True
        return None

    def _fetch_with_trendspy(self, aliases: list[str]) -> dict[str, float] | None:
        """
        Fallback: fetch trends data using trendspy package when pytrends is blocked.

        Returns:
            Dict with {interest, interest_7d_avg} or None on failure.
        """
        try:
            from trendspy import Trends

            tr = Trends()
            # trendspy uses a different API endpoint that may not be blocked
            # Use the first alias as the primary keyword
            keyword = aliases[0]

            self.logger.info(f"Trying trendspy fallback for '{keyword}'")

            # Get interest over time for the last 7 days
            df = tr.interest_over_time(
                keyword,
                timeframe="now 7-d",
                geo="",
            )

            if df is None or df.empty:
                self.logger.warning(f"trendspy returned empty data for '{keyword}'")
                return None

            # Extract values
            values = df[keyword] if keyword in df.columns else df.iloc[:, 0]
            interest = float(values.iloc[-1])
            interest_7d_avg = float(values.mean())

            self.logger.info(
                f"trendspy fallback success: interest={interest:.1f}, "
                f"7d_avg={interest_7d_avg:.1f}"
            )
            return {
                "interest": round(interest, 2),
                "interest_7d_avg": round(interest_7d_avg, 2),
            }

        except ImportError:
            self.logger.warning("trendspy package not installed, fallback unavailable")
            return None
        except Exception as e:
            self.logger.warning(f"trendspy fallback failed: {e}")
            return None

    def _cache_key(self, model_slug: str) -> str:
        """Build Redis cache key for a model's trends data."""
        today = date.today().isoformat()
        return f"trends:{model_slug}:{today}"

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Google Trends interest for a model.

        Queries interest_over_time for aliases (batched in groups of 5,
        the pytrends max). Takes the max interest value per day across
        all aliases, then computes a 7-day rolling average.

        Fallback chain: pytrends → trendspy → Redis cache.
        On success: writes result to Redis cache (24h TTL).

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
        cache_key = self._cache_key(model_slug)

        # If pytrends was already blocked in this session, skip directly to trendspy
        if self._pytrends_blocked:
            self.logger.info(
                f"pytrends blocked this session, using trendspy fallback for {model_slug}"
            )
            trendspy_data = self._fetch_with_trendspy(aliases)
            if trendspy_data:
                result = self.make_result(
                    model_slug=model_slug,
                    metrics=trendspy_data,
                )
                result["raw_json"] = {
                    "aliases_queried": aliases,
                    "source": "trendspy_fallback",
                    "pytrends_blocked": True,
                }
                # Cache successful trendspy result
                cache_set(cache_key, trendspy_data, ttl=CACHE_TTL_SECS)
                return result

            # Last resort: try Redis cache
            return self._fallback_to_cache(model_slug, aliases, cache_key)

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
            # All pytrends batches failed — try trendspy fallback
            self.logger.warning(
                f"All pytrends batches failed for {model_slug}, trying trendspy fallback"
            )
            trendspy_data = self._fetch_with_trendspy(aliases)
            if trendspy_data:
                result = self.make_result(
                    model_slug=model_slug,
                    metrics=trendspy_data,
                )
                result["raw_json"] = {
                    "aliases_queried": aliases,
                    "source": "trendspy_fallback",
                    "pytrends_blocked": True,
                }
                cache_set(cache_key, trendspy_data, ttl=CACHE_TTL_SECS)
                return result

            # Last resort: try Redis cache
            return self._fallback_to_cache(model_slug, aliases, cache_key)

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

        metrics = {
            "interest": round(interest, 2),
            "interest_7d_avg": round(interest_7d_avg, 2),
        }

        result = self.make_result(
            model_slug=model_slug,
            metrics=metrics,
        )
        result["raw_json"] = {
            "aliases_queried": aliases,
            "source": "pytrends",
            "daily_max": raw_daily,
            "num_datapoints": len(max_per_timestamp),
        }

        # Cache successful result
        cache_set(cache_key, metrics, ttl=CACHE_TTL_SECS)

        self.logger.info(
            f"Trends for {model_slug}: interest={interest:.1f}, 7d_avg={interest_7d_avg:.1f}"
        )
        return result

    def _fallback_to_cache(
        self, model_slug: str, aliases: list[str], cache_key: str
    ) -> dict[str, Any] | None:
        """Try Redis cache as last-resort fallback when all live sources fail."""
        cached = cache_get(cache_key)
        if cached:
            self.logger.warning(
                f"All live sources failed for {model_slug}, "
                f"using Redis cached data"
            )
            result = self.make_result(
                model_slug=model_slug,
                metrics=cached,
            )
            result["raw_json"] = {
                "aliases_queried": aliases,
                "source": "redis_cache_fallback",
            }
            return result

        self.logger.error(
            f"All trends sources failed for {model_slug} "
            f"(pytrends + trendspy + cache)"
        )
        return None
