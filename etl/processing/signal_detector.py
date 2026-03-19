"""
Signal Detector for AI Virality Index — v0.2

Detects Notable Changes (descriptive, not predictive) based on
observed activity patterns. Three honest signal types:

    1. spike    — VI rose >1.5σ over 7 days → "rising"
    2. drop     — VI fell >1.5σ over 7 days → "declining"
    3. rank_change — model moved ≥2 rank positions over 7 days → "rising"/"declining"

All signals use neutral language ("rising"/"declining" not "bullish"/"bearish")
and describe what happened, not what will happen.
"""

import logging
from datetime import date, timedelta
from typing import Any

import numpy as np

from etl.storage.supabase_client import get_client, get_all_models

logger = logging.getLogger(__name__)


def _get_daily_scores_series(
    model_id: str,
    days: int = 30,
) -> list[dict[str, Any]]:
    """Fetch daily_scores rows for a model, ordered by date asc."""
    client = get_client()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    result = (
        client.table("daily_scores")
        .select("date, vi_trade, delta7_trade")
        .eq("model_id", model_id)
        .gte("date", start_date)
        .order("date", desc=False)
        .execute()
    )
    return result.data


def detect_spike(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect VI spike: rose >1.5σ over 7 days.

    Uses rolling z-score of delta7 values to identify statistically
    significant increases.

    Returns signal dict or None.
    """
    daily_rows = _get_daily_scores_series(model_id, days=30)
    if len(daily_rows) < 8:
        return None

    vi_values = [float(r["vi_trade"]) for r in daily_rows]

    # Calculate delta7 series
    deltas = []
    for i in range(7, len(vi_values)):
        deltas.append(vi_values[i] - vi_values[i - 7])

    if len(deltas) < 3:
        return None

    # Z-score of latest delta7
    arr = np.array(deltas, dtype=np.float64)
    mean = np.mean(arr)
    std = np.std(arr)
    if std < 1e-9:
        return None

    z = float((arr[-1] - mean) / std)

    if z <= 1.5:
        return None

    current_vi = vi_values[-1]
    delta7 = deltas[-1]

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "spike",
        "direction": "rising",
        "strength": round(min(100, abs(z) * 33.3), 2),
        "vi_trade": current_vi,
        "polymarket_odds": 0,
        "divergence_score": round(z, 3),
        "reasoning": (
            f"VI rose {delta7:+.1f} pts over 7 days (z-score={z:.2f}, >1.5σ). "
            f"Current VI={current_vi:.1f}."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def detect_drop(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect VI drop: fell >1.5σ over 7 days.

    Uses rolling z-score of delta7 values to identify statistically
    significant decreases.

    Returns signal dict or None.
    """
    daily_rows = _get_daily_scores_series(model_id, days=30)
    if len(daily_rows) < 8:
        return None

    vi_values = [float(r["vi_trade"]) for r in daily_rows]

    # Calculate delta7 series
    deltas = []
    for i in range(7, len(vi_values)):
        deltas.append(vi_values[i] - vi_values[i - 7])

    if len(deltas) < 3:
        return None

    # Z-score of latest delta7
    arr = np.array(deltas, dtype=np.float64)
    mean = np.mean(arr)
    std = np.std(arr)
    if std < 1e-9:
        return None

    z = float((arr[-1] - mean) / std)

    if z >= -1.5:
        return None

    current_vi = vi_values[-1]
    delta7 = deltas[-1]

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "drop",
        "direction": "declining",
        "strength": round(min(100, abs(z) * 33.3), 2),
        "vi_trade": current_vi,
        "polymarket_odds": 0,
        "divergence_score": round(z, 3),
        "reasoning": (
            f"VI fell {delta7:+.1f} pts over 7 days (z-score={z:.2f}, <-1.5σ). "
            f"Current VI={current_vi:.1f}."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def detect_rank_change(
    model_id: str,
    calc_date: date,
    all_scores: dict[str, list[dict]] | None = None,
) -> dict[str, Any] | None:
    """
    Detect rank change: model moved ≥2 positions over 7 days.

    Requires all_scores dict (model_id -> daily_scores rows) to compute
    cross-model rankings. If not provided, returns None.

    Returns signal dict or None.
    """
    if all_scores is None:
        return None

    # Get today's and 7-days-ago rankings
    today_str = calc_date.isoformat()
    week_ago_str = (calc_date - timedelta(days=7)).isoformat()

    def get_rank_on_date(target_date: str) -> dict[str, int]:
        """Return {model_id: rank} for all models on a given date."""
        scores_on_date: list[tuple[str, float]] = []
        for mid, rows in all_scores.items():
            for r in rows:
                if r["date"] == target_date:
                    scores_on_date.append((mid, float(r["vi_trade"])))
                    break
        # Sort descending by score
        scores_on_date.sort(key=lambda x: x[1], reverse=True)
        return {mid: i + 1 for i, (mid, _) in enumerate(scores_on_date)}

    today_ranks = get_rank_on_date(today_str)
    week_ago_ranks = get_rank_on_date(week_ago_str)

    if model_id not in today_ranks or model_id not in week_ago_ranks:
        return None

    rank_today = today_ranks[model_id]
    rank_week_ago = week_ago_ranks[model_id]
    rank_change = rank_week_ago - rank_today  # positive = improved

    if abs(rank_change) < 2:
        return None

    direction = "rising" if rank_change > 0 else "declining"

    # Get current VI
    current_vi = 0
    for r in all_scores.get(model_id, []):
        if r["date"] == today_str:
            current_vi = float(r["vi_trade"])
            break

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "rank_change",
        "direction": direction,
        "strength": round(min(100, abs(rank_change) * 25), 2),
        "vi_trade": current_vi,
        "polymarket_odds": 0,
        "divergence_score": rank_change,
        "reasoning": (
            f"Rank moved from #{rank_week_ago} to #{rank_today} over 7 days "
            f"({rank_change:+d} positions). Current VI={current_vi:.1f}."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def run_signal_detection(calc_date: date) -> list[dict[str, Any]]:
    """
    Run all signal detectors for all models, write to signals table.

    v0.2: 3 descriptive detectors (spike, drop, rank_change).
    No conflict resolution needed — types are mutually exclusive
    (a model can have a spike + rank_change on the same day).

    Args:
        calc_date: Date to run detection for.

    Returns:
        List of detected signals.
    """
    models = get_all_models()
    client = get_client()

    # Pre-fetch all daily_scores for rank_change detection
    start_date = (calc_date - timedelta(days=14)).isoformat()
    all_scores: dict[str, list[dict]] = {}
    for model in models:
        model_id = model["id"]
        result = (
            client.table("daily_scores")
            .select("date, vi_trade")
            .eq("model_id", model_id)
            .gte("date", start_date)
            .order("date", desc=False)
            .execute()
        )
        all_scores[model_id] = result.data

    all_signals: list[dict[str, Any]] = []

    for model in models:
        model_id = model["id"]
        slug = model["slug"]

        for detector in [detect_spike, detect_drop]:
            try:
                signal = detector(model_id, calc_date)
                if signal is not None:
                    all_signals.append(signal)
                    _upsert_signal(client, signal, slug)
            except Exception as e:
                logger.error(f"  {slug}: {detector.__name__} failed — {e}")

        # rank_change needs all_scores
        try:
            signal = detect_rank_change(model_id, calc_date, all_scores=all_scores)
            if signal is not None:
                all_signals.append(signal)
                _upsert_signal(client, signal, slug)
        except Exception as e:
            logger.error(f"  {slug}: detect_rank_change failed — {e}")

    logger.info(
        f"Signal detection complete: {len(all_signals)} signals detected "
        f"across {len(models)} models"
    )

    return all_signals


def _upsert_signal(client: Any, signal: dict, slug: str) -> None:
    """Upsert a signal to the signals table."""
    try:
        client.table("signals").upsert(
            signal,
            on_conflict="model_id,date,signal_type",
        ).execute()
        logger.info(
            f"  {slug}: {signal['signal_type']} "
            f"({signal['direction']}, strength={signal['strength']})"
        )
    except Exception as e:
        logger.error(f"  {slug}: upsert {signal['signal_type']} failed — {e}")
