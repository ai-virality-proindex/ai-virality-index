"""
Supabase client — handles all database operations for the ETL pipeline.
Uses service_role key for full access (bypasses RLS).
"""

import logging
from datetime import date
from typing import Any
from uuid import UUID

from supabase import create_client, Client

from etl.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    """Get or create Supabase client (singleton)."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def get_model_id(slug: str) -> str | None:
    """
    Look up model UUID by slug.

    Args:
        slug: Model slug (e.g., 'chatgpt', 'gemini')

    Returns:
        UUID string or None if not found.
    """
    client = get_client()
    result = (
        client.table("models")
        .select("id")
        .eq("slug", slug)
        .eq("is_active", True)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]
    logger.warning(f"Model not found: {slug}")
    return None


def get_aliases(model_id: str, alias_type: str) -> list[str]:
    """
    Get aliases for a model by type.

    Args:
        model_id: UUID of the model
        alias_type: Type of alias ('search_query', 'github_repo', 'subreddit', 'gdelt_query', 'arena_name')

    Returns:
        List of alias strings.
    """
    client = get_client()
    result = (
        client.table("model_aliases")
        .select("alias_value")
        .eq("model_id", model_id)
        .eq("alias_type", alias_type)
        .execute()
    )
    return [row["alias_value"] for row in result.data]


def get_all_models() -> list[dict[str, Any]]:
    """Get all active models with their IDs and slugs."""
    client = get_client()
    result = (
        client.table("models")
        .select("id, slug, name, company")
        .eq("is_active", True)
        .order("slug")
        .execute()
    )
    return result.data


def upsert_raw_metrics(
    model_id: str,
    metric_date: date,
    source: str,
    metrics: dict[str, Any],
    raw_json: dict | None = None,
) -> None:
    """
    Upsert raw metrics into raw_metrics table.
    One row per (model_id, date, source, metric_name).

    Args:
        model_id: UUID of the model
        metric_date: Date of the measurement
        source: Data source ('trends', 'youtube', 'reddit', etc.)
        metrics: Dict of {metric_name: metric_value}
        raw_json: Optional raw API response for debugging
    """
    client = get_client()
    rows = []
    for metric_name, metric_value in metrics.items():
        if metric_value is None:
            continue
        rows.append({
            "model_id": model_id,
            "date": metric_date.isoformat(),
            "source": source,
            "metric_name": metric_name,
            "metric_value": float(metric_value),
            "raw_json": raw_json,
        })

    if not rows:
        logger.warning(f"No metrics to upsert for {source}/{model_id} on {metric_date}")
        return

    result = (
        client.table("raw_metrics")
        .upsert(rows, on_conflict="model_id,date,source,metric_name")
        .execute()
    )
    logger.info(
        f"Upserted {len(rows)} metrics for source={source}, model={model_id}, date={metric_date}"
    )


def get_raw_metrics(
    model_id: str,
    source: str,
    metric_name: str,
    days: int = 90,
) -> list[dict[str, Any]]:
    """
    Query raw_metrics for a model/source/metric, ordered by date desc.

    Args:
        model_id: UUID of the model
        source: Data source name
        metric_name: Metric name to query
        days: Number of days to look back

    Returns:
        List of dicts with 'date' and 'metric_value' keys.
    """
    from datetime import timedelta

    client = get_client()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    result = (
        client.table("raw_metrics")
        .select("date, metric_value")
        .eq("model_id", model_id)
        .eq("source", source)
        .eq("metric_name", metric_name)
        .gte("date", start_date)
        .order("date", desc=False)
        .execute()
    )
    return result.data
