"""
Quality/Credibility collector — fetches Chatbot Arena (LMArena) Elo ratings.

Uses the public LMSYS Chatbot Arena leaderboard API to get Elo ratings
for tracked AI models.

Metrics collected:
- elo_rating: current Arena Elo rating
- arena_rank: position in the leaderboard
- elo_delta_7d: change in Elo over last 7 days (requires historical data)

Fallback: If the API is unavailable, uses a manually-updated JSON config
file (etl/data/arena_ratings.json) that can be refreshed weekly.
"""

import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

# LMArena / Chatbot Arena public leaderboard endpoint
ARENA_LEADERBOARD_URL = "https://huggingface.co/api/spaces/lmsys/chatbot-arena-leaderboard"
ARENA_RESULTS_URL = "https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard/resolve/main/results.json"

# Fallback manual ratings file
MANUAL_RATINGS_PATH = Path(__file__).parent.parent / "data" / "arena_ratings.json"

REQUEST_DELAY_SECS = 1.0


class QualityCollector(BaseCollector):
    """Collects AI model quality/credibility scores from Arena Elo ratings."""

    source_name: str = "arena"

    def __init__(self, timeout: int = 20):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0 (research aggregator)",
        })
        self._leaderboard: dict[str, dict] | None = None

    def _fetch_leaderboard(self) -> dict[str, dict]:
        """
        Fetch the Arena leaderboard and build a lookup by model name.

        Returns:
            Dict mapping lowercase model name -> {elo, rank, name}.
        """
        if self._leaderboard is not None:
            return self._leaderboard

        # Try fetching from lmarena.ai API
        leaderboard = self._try_lmarena_api()
        if leaderboard:
            self._leaderboard = leaderboard
            return leaderboard

        # Fallback: manual ratings file
        leaderboard = self._load_manual_ratings()
        if leaderboard:
            self._leaderboard = leaderboard
            return leaderboard

        self.logger.warning("Could not fetch Arena leaderboard from any source")
        self._leaderboard = {}
        return {}

    def _try_lmarena_api(self) -> dict[str, dict] | None:
        """Try fetching from lmarena.ai direct API."""
        try:
            # Try the direct leaderboard endpoint
            resp = self._session.get(
                "https://lmarena.ai/api/v1/leaderboard",
                timeout=self._timeout,
            )

            if resp.status_code != 200:
                self.logger.info(f"lmarena.ai API returned {resp.status_code}, trying HF")
                return self._try_hf_api()

            data = resp.json()
            return self._parse_leaderboard(data)

        except Exception as e:
            self.logger.info(f"lmarena.ai API failed: {e}, trying HF")
            return self._try_hf_api()

    def _try_hf_api(self) -> dict[str, dict] | None:
        """Try fetching from HuggingFace hosted results."""
        try:
            resp = self._session.get(
                ARENA_RESULTS_URL,
                timeout=self._timeout,
            )
            if resp.status_code != 200:
                self.logger.warning(f"HF Arena results returned {resp.status_code}")
                return None

            data = resp.json()
            return self._parse_leaderboard(data)

        except Exception as e:
            self.logger.warning(f"HF Arena results failed: {e}")
            return None

    def _parse_leaderboard(self, data: Any) -> dict[str, dict] | None:
        """Parse leaderboard data into our lookup format."""
        leaderboard: dict[str, dict] = {}

        try:
            # Handle different response formats
            entries = []
            if isinstance(data, list):
                entries = data
            elif isinstance(data, dict):
                entries = data.get("data", data.get("results", data.get("leaderboard", [])))
                if not isinstance(entries, list):
                    entries = []

            for i, entry in enumerate(entries):
                if isinstance(entry, dict):
                    name = entry.get("model", entry.get("name", entry.get("Model", "")))
                    elo = entry.get("elo", entry.get("rating", entry.get("Arena Elo", 0)))
                    rank = entry.get("rank", entry.get("Rank", i + 1))

                    if name and elo:
                        leaderboard[name.lower()] = {
                            "name": name,
                            "elo": float(elo),
                            "rank": int(rank),
                        }

            if leaderboard:
                self.logger.info(
                    f"Loaded {len(leaderboard)} models from Arena leaderboard"
                )
            return leaderboard if leaderboard else None

        except Exception as e:
            self.logger.warning(f"Failed to parse leaderboard data: {e}")
            return None

    def _load_manual_ratings(self) -> dict[str, dict] | None:
        """Load manually-curated ratings from JSON file."""
        if not MANUAL_RATINGS_PATH.exists():
            self.logger.info(f"No manual ratings file at {MANUAL_RATINGS_PATH}")
            return None

        try:
            with open(MANUAL_RATINGS_PATH, "r") as f:
                data = json.load(f)

            leaderboard: dict[str, dict] = {}
            for entry in data.get("ratings", []):
                name = entry.get("name", "").lower()
                if name:
                    leaderboard[name] = {
                        "name": entry.get("name", ""),
                        "elo": float(entry.get("elo", 0)),
                        "rank": int(entry.get("rank", 0)),
                    }

            self.logger.info(
                f"Loaded {len(leaderboard)} manual ratings from {MANUAL_RATINGS_PATH}"
            )
            return leaderboard

        except Exception as e:
            self.logger.warning(f"Failed to load manual ratings: {e}")
            return None

    def _find_model_in_leaderboard(
        self, arena_name: str, leaderboard: dict[str, dict]
    ) -> dict | None:
        """
        Find a model in the leaderboard by its arena name alias.
        Tries exact match first, then substring match.
        """
        key = arena_name.lower()

        # Exact match
        if key in leaderboard:
            return leaderboard[key]

        # Substring match
        for lb_key, lb_val in leaderboard.items():
            if key in lb_key or lb_key in key:
                return lb_val

        return None

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Arena Elo rating for a model.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List containing the arena_name alias (e.g., ['GPT-4o']).

        Returns:
            Result dict with metrics or None on complete failure.
        """
        self.logger.info(f"Fetching Arena quality data for {model_slug}")

        leaderboard = self._fetch_leaderboard()

        if not leaderboard:
            self.logger.warning(
                f"No leaderboard data available, returning zeros for {model_slug}"
            )
            return self.make_result(
                model_slug=model_slug,
                metrics={"elo_rating": 0, "arena_rank": 0, "elo_delta_7d": 0},
            )

        # Try each alias to find the model
        found = None
        for alias in aliases:
            found = self._find_model_in_leaderboard(alias, leaderboard)
            if found:
                break

        if not found:
            # Try the model slug itself
            found = self._find_model_in_leaderboard(model_slug, leaderboard)

        if not found:
            self.logger.info(
                f"Model {model_slug} not found in Arena leaderboard "
                f"(searched: {aliases}), returning zeros"
            )
            return self.make_result(
                model_slug=model_slug,
                metrics={"elo_rating": 0, "arena_rank": 0, "elo_delta_7d": 0},
            )

        elo_rating = found["elo"]
        arena_rank = found["rank"]

        # Calculate 7-day delta if historical data available
        elo_delta_7d = 0
        try:
            from etl.storage.supabase_client import get_model_id, get_client

            model_id = get_model_id(model_slug)
            if model_id:
                week_ago = (date.today() - timedelta(days=7)).isoformat()
                client = get_client()
                result = (
                    client.table("raw_metrics")
                    .select("metric_value")
                    .eq("model_id", model_id)
                    .eq("source", "arena")
                    .eq("metric_name", "elo_rating")
                    .eq("date", week_ago)
                    .execute()
                )
                if result.data:
                    old_elo = float(result.data[0]["metric_value"])
                    elo_delta_7d = round(elo_rating - old_elo, 1)
        except Exception as e:
            self.logger.warning(f"Could not compute Elo delta for {model_slug}: {e}")

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "elo_rating": elo_rating,
                "arena_rank": arena_rank,
                "elo_delta_7d": elo_delta_7d,
            },
        )
        result["raw_json"] = {
            "arena_name_matched": found["name"],
            "aliases_searched": aliases,
            "leaderboard_size": len(leaderboard),
        }

        self.logger.info(
            f"Arena for {model_slug}: elo={elo_rating}, "
            f"rank={arena_rank}, Δelo_7d={elo_delta_7d}"
        )
        return result
