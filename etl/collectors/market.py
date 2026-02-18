"""
Market collector — fetches prediction market odds from Polymarket Gamma API.

Searches for AI-related markets on Polymarket and extracts odds/volume
for tracked models. Since relevant markets may not always exist,
this collector degrades gracefully.

Metrics collected:
- market_found: 1 if a relevant market exists, 0 otherwise
- odds: best matching market odds (0-1) or 0 if no market
- volume_24h: 24h trading volume in USD or 0
"""

import logging
import time
from typing import Any

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

# Polymarket Gamma API
GAMMA_API_URL = "https://gamma-api.polymarket.com"
REQUEST_DELAY_SECS = 1.0

# AI-related search terms to find relevant markets
AI_MARKET_QUERIES = [
    "AI model",
    "ChatGPT",
    "artificial intelligence",
    "LLM",
    "AI benchmark",
]


class PolymarketCollector(BaseCollector):
    """Collects prediction market data for AI models from Polymarket."""

    source_name: str = "polymarket"

    def __init__(self, timeout: int = 20):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0 (research aggregator)",
        })
        self._markets_cache: list[dict] | None = None

    def _fetch_ai_markets(self) -> list[dict]:
        """
        Fetch AI-related markets from Polymarket.

        Returns:
            List of market dicts with title, odds, volume, etc.
        """
        if self._markets_cache is not None:
            return self._markets_cache

        all_markets: list[dict] = []
        seen_ids: set[str] = set()

        for query in AI_MARKET_QUERIES:
            try:
                resp = self._session.get(
                    f"{GAMMA_API_URL}/markets",
                    params={
                        "search": query,
                        "limit": 50,
                        "active": "true",
                    },
                    timeout=self._timeout,
                )

                if resp.status_code != 200:
                    self.logger.warning(
                        f"Polymarket API returned {resp.status_code} for '{query}'"
                    )
                    continue

                markets = resp.json()
                if not isinstance(markets, list):
                    continue

                for m in markets:
                    mid = m.get("id", m.get("condition_id", ""))
                    if mid and mid not in seen_ids:
                        seen_ids.add(mid)
                        all_markets.append(m)

            except requests.RequestException as e:
                self.logger.warning(f"Polymarket API error for '{query}': {e}")

            time.sleep(REQUEST_DELAY_SECS)

        self._markets_cache = all_markets
        self.logger.info(f"Fetched {len(all_markets)} AI-related markets from Polymarket")
        return all_markets

    def _find_model_market(
        self, model_slug: str, aliases: list[str], markets: list[dict]
    ) -> dict | None:
        """
        Find the most relevant market for a given model.

        Args:
            model_slug: Model slug (e.g., 'chatgpt').
            aliases: Search aliases for the model.
            markets: List of Polymarket market dicts.

        Returns:
            Best matching market dict or None.
        """
        search_terms = [model_slug.lower()] + [a.lower() for a in aliases]

        best_match = None
        best_score = 0

        for market in markets:
            title = (market.get("question", "") or market.get("title", "")).lower()
            description = (market.get("description", "")).lower()
            text = f"{title} {description}"

            # Score by number of matching terms
            score = 0
            for term in search_terms:
                if term in text:
                    score += 1
                    # Bonus for title match
                    if term in title:
                        score += 2

            if score > best_score:
                best_score = score
                best_match = market

        return best_match if best_score >= 1 else None

    def _extract_odds_and_volume(self, market: dict) -> tuple[float, float]:
        """
        Extract odds and volume from a market dict.

        Returns:
            Tuple of (odds as 0-1 float, volume_24h as float).
        """
        # Try different field names Polymarket uses
        odds = 0.0
        volume = 0.0

        # Odds
        for key in ["outcomePrices", "outcome_prices", "bestBid", "best_bid"]:
            val = market.get(key)
            if val:
                if isinstance(val, str):
                    # Could be JSON string like "[0.65, 0.35]"
                    try:
                        import json
                        parsed = json.loads(val)
                        if isinstance(parsed, list) and parsed:
                            odds = float(parsed[0])
                            break
                    except (json.JSONDecodeError, ValueError):
                        try:
                            odds = float(val)
                            break
                        except ValueError:
                            pass
                elif isinstance(val, (int, float)):
                    odds = float(val)
                    break
                elif isinstance(val, list) and val:
                    odds = float(val[0])
                    break

        # Volume
        for key in ["volume24hr", "volume_24hr", "volume", "volumeNum"]:
            val = market.get(key)
            if val is not None:
                try:
                    volume = float(val)
                    break
                except (ValueError, TypeError):
                    pass

        return odds, volume

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch Polymarket data for a model.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: Search terms for finding relevant markets.

        Returns:
            Result dict with metrics, always returns data (zeros if no market found).
        """
        self.logger.info(f"Fetching Polymarket data for {model_slug}")

        markets = self._fetch_ai_markets()

        # Find the most relevant market for this model
        market = self._find_model_market(model_slug, aliases, markets)

        if market is None:
            self.logger.info(
                f"No relevant Polymarket market found for {model_slug}"
            )
            result = self.make_result(
                model_slug=model_slug,
                metrics={
                    "market_found": 0,
                    "odds": 0.0,
                    "volume_24h": 0.0,
                },
            )
            result["raw_json"] = {
                "aliases_searched": aliases,
                "total_ai_markets": len(markets),
                "matched_market": None,
            }
            return result

        odds, volume = self._extract_odds_and_volume(market)
        market_title = market.get("question", market.get("title", "Unknown"))

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "market_found": 1,
                "odds": round(odds, 4),
                "volume_24h": round(volume, 2),
            },
        )
        result["raw_json"] = {
            "aliases_searched": aliases,
            "matched_market_title": market_title,
            "matched_market_id": market.get("id", ""),
            "total_ai_markets": len(markets),
        }

        self.logger.info(
            f"Polymarket for {model_slug}: market='{market_title}', "
            f"odds={odds:.4f}, volume_24h=${volume:.2f}"
        )
        return result
