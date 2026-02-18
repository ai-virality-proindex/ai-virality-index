"""
Base collector class for AI Virality Index ETL pipeline.
All collectors inherit from this class.
"""

import logging
from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Any

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Abstract base class for all data collectors."""

    source_name: str = "unknown"  # Override in subclass

    def __init__(self):
        self.logger = logging.getLogger(f"etl.collectors.{self.source_name}")

    @abstractmethod
    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch raw data for a single model.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt', 'gemini')
            aliases: List of search terms / repo names / etc.

        Returns:
            Dict with structure:
            {
                "date": "2025-06-15",
                "model_slug": "chatgpt",
                "source": "trends",
                "metrics": {
                    "metric_name": value,
                    ...
                }
            }
            Or None if fetch failed entirely.
        """
        pass

    def fetch_with_retry(
        self, model_slug: str, aliases: list[str]
    ) -> dict[str, Any] | None:
        """Fetch with automatic retry on transient errors."""
        try:
            return self._fetch_with_retry_internal(model_slug, aliases)
        except Exception as e:
            self.logger.error(
                f"All retries failed for {self.source_name}/{model_slug}: {e}"
            )
            return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def _fetch_with_retry_internal(
        self, model_slug: str, aliases: list[str]
    ) -> dict[str, Any] | None:
        """Internal retry wrapper."""
        return self.fetch(model_slug, aliases)

    def make_result(
        self, model_slug: str, metrics: dict[str, Any]
    ) -> dict[str, Any]:
        """Helper to create a properly formatted result dict."""
        return {
            "date": date.today().isoformat(),
            "model_slug": model_slug,
            "source": self.source_name,
            "metrics": metrics,
            "fetched_at": datetime.utcnow().isoformat(),
        }

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} source={self.source_name}>"
