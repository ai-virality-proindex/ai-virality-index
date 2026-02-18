"""
Upstash Redis cache helper for ETL pipeline.

Uses Upstash REST API (no redis-py dependency needed).
Falls back gracefully if Redis is not configured.
"""

import json
import logging
from typing import Any

import requests

from etl.config import UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN

logger = logging.getLogger(__name__)

# Default TTL: 24 hours
DEFAULT_TTL_SECS = 86400


def _is_configured() -> bool:
    """Check if Upstash Redis credentials are available."""
    return bool(UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN)


def cache_get(key: str) -> Any | None:
    """
    Get a value from Redis cache.

    Returns:
        Parsed JSON value, or None if not found or Redis unavailable.
    """
    if not _is_configured():
        return None

    try:
        resp = requests.get(
            f"{UPSTASH_REDIS_URL}/get/{key}",
            headers={"Authorization": f"Bearer {UPSTASH_REDIS_TOKEN}"},
            timeout=5,
        )
        if resp.status_code != 200:
            return None

        data = resp.json()
        result = data.get("result")
        if result is None:
            return None

        return json.loads(result)

    except Exception as e:
        logger.debug(f"Redis GET failed for {key}: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL_SECS) -> bool:
    """
    Set a value in Redis cache with TTL.

    Args:
        key: Cache key.
        value: Any JSON-serializable value.
        ttl: Time-to-live in seconds (default 24h).

    Returns:
        True if stored successfully, False otherwise.
    """
    if not _is_configured():
        return False

    try:
        payload = json.dumps(value)
        resp = requests.get(
            f"{UPSTASH_REDIS_URL}/set/{key}/{payload}/ex/{ttl}",
            headers={"Authorization": f"Bearer {UPSTASH_REDIS_TOKEN}"},
            timeout=5,
        )
        return resp.status_code == 200

    except Exception as e:
        logger.debug(f"Redis SET failed for {key}: {e}")
        return False
