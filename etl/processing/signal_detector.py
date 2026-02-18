"""
Signal Detector for AI Virality Index.

Detects trading signals based on divergence between virality index
and prediction market odds, momentum breakouts, and quality-backed trends.

Spec reference: TECHNICAL_SPEC.md section 2.7

Signal types:
    1. divergence — VI_trade momentum diverges from Polymarket odds
    2. momentum_breakout — strong virality spike not yet priced in
    3. quality_backed — rising virality supported by quality + developer adoption
"""

import logging
from datetime import date, timedelta
from typing import Any

import numpy as np

from etl.storage.supabase_client import get_client, get_all_models, get_raw_metrics

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
        .select("*")
        .eq("model_id", model_id)
        .gte("date", start_date)
        .order("date", desc=False)
        .execute()
    )
    return result.data


def _get_component_score(
    model_id: str,
    component: str,
    calc_date: date,
) -> float | None:
    """Get the smoothed component score for a model on a given date."""
    client = get_client()
    result = (
        client.table("component_scores")
        .select("smoothed_value")
        .eq("model_id", model_id)
        .eq("component", component)
        .eq("date", calc_date.isoformat())
        .execute()
    )
    if result.data:
        return float(result.data[0]["smoothed_value"])
    return None


def _z_score(values: list[float]) -> float:
    """Compute z-score of the last value relative to the series."""
    if len(values) < 3:
        return 0.0
    arr = np.array(values, dtype=np.float64)
    mean = np.mean(arr)
    std = np.std(arr)
    if std < 1e-9:
        return 0.0
    return float((arr[-1] - mean) / std)


def detect_divergence(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect divergence between VI_trade momentum and Polymarket odds.

    Divergence = z(Delta7(VI_trade)) - z(Delta7(odds))
    Trigger if |Divergence| > 1.5

    Args:
        model_id: UUID of the model.
        calc_date: Date to check.

    Returns:
        Signal dict or None if no divergence detected.
    """
    # Get VI_trade history — need at least 8 days for meaningful delta7
    daily_rows = _get_daily_scores_series(model_id, days=30)
    if len(daily_rows) < 8:
        return None

    vi_trade_values = [float(r["vi_trade"]) for r in daily_rows]

    # Calculate delta7 series for VI_trade
    vi_deltas = []
    for i in range(7, len(vi_trade_values)):
        vi_deltas.append(vi_trade_values[i] - vi_trade_values[i - 7])

    if len(vi_deltas) < 3:
        return None

    # Get Polymarket odds history
    odds_rows = get_raw_metrics(model_id, "polymarket", "odds", days=30)
    if len(odds_rows) < 8:
        return None

    odds_values = [float(r["metric_value"]) for r in odds_rows]

    # Calculate delta7 for odds
    odds_deltas = []
    for i in range(7, len(odds_values)):
        odds_deltas.append(odds_values[i] - odds_values[i - 7])

    if len(odds_deltas) < 3:
        return None

    # Z-scores
    z_vi = _z_score(vi_deltas)
    z_odds = _z_score(odds_deltas)
    divergence = z_vi - z_odds

    if abs(divergence) <= 1.5:
        return None

    # Determine direction
    direction = "bullish" if divergence > 0 else "bearish"
    # Bullish: VI rising faster than odds (odds haven't caught up)
    # Bearish: VI falling faster than odds (odds haven't adjusted down)

    current_vi = vi_trade_values[-1]
    current_odds = odds_values[-1] if odds_values else 0

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "divergence",
        "direction": direction,
        "strength": round(min(100, abs(divergence) * 33.3), 2),  # ~1.5->50, 3.0->100
        "vi_trade": current_vi,
        "polymarket_odds": current_odds,
        "divergence_score": round(divergence, 3),
        "reasoning": (
            f"VI_trade momentum z={z_vi:.2f} vs odds momentum z={z_odds:.2f}. "
            f"Divergence={divergence:.2f} exceeds threshold 1.5."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def detect_momentum_breakout(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect momentum breakout: strong virality not yet reflected in odds.

    Uses adaptive thresholds based on available data:
    - With 7+ days of data: VI > 65, delta7 > 10
    - Full thresholds (14+ days): VI > 70, delta7 > 15

    Args:
        model_id: UUID of the model.
        calc_date: Date to check.

    Returns:
        Signal dict or None if no breakout detected.
    """
    # Get latest daily_scores
    daily_rows = _get_daily_scores_series(model_id, days=14)
    if len(daily_rows) < 3:
        return None

    latest = daily_rows[-1]
    vi_trade = float(latest["vi_trade"])
    delta7 = float(latest.get("delta7_trade") or 0)
    accel = float(latest.get("accel_trade") or 0)

    # Adaptive thresholds: stricter with more history
    days_available = len(daily_rows)
    if days_available >= 14:
        vi_threshold, delta_threshold = 70, 15
    elif days_available >= 7:
        vi_threshold, delta_threshold = 65, 10
    else:
        vi_threshold, delta_threshold = 60, 5

    # Check VI conditions
    if vi_trade <= vi_threshold or delta7 <= delta_threshold or accel <= 0:
        return None

    # Check odds movement
    odds_rows = get_raw_metrics(model_id, "polymarket", "odds", days=14)
    odds_grew = 0.0
    if len(odds_rows) >= 2:
        recent_odds = [float(r["metric_value"]) for r in odds_rows]
        if len(recent_odds) >= 8:
            odds_grew = recent_odds[-1] - recent_odds[-8]
        else:
            odds_grew = recent_odds[-1] - recent_odds[0]

    if odds_grew >= 5.0:
        return None  # Odds already caught up

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "momentum_breakout",
        "direction": "bullish",
        "strength": round(min(100, vi_trade * 0.5 + delta7 * 2), 2),
        "vi_trade": vi_trade,
        "polymarket_odds": float(odds_rows[-1]["metric_value"]) if odds_rows else 0,
        "divergence_score": round(delta7 - odds_grew, 3),
        "reasoning": (
            f"VI_trade={vi_trade:.1f}>{vi_threshold}, delta7={delta7:+.1f}>{delta_threshold}, "
            f"accel={accel:+.1f}>0, but odds only moved {odds_grew:+.1f}pp."
        ),
        "expires_at": (calc_date + timedelta(days=5)).isoformat(),
    }


def detect_quality_backed(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect quality-backed virality: rising VI supported by fundamentals.

    Conditions:
        - VI_trade growing (delta7 > 0)
        - Q component > 75
        - G component growing (GitHub delta positive)

    Args:
        model_id: UUID of the model.
        calc_date: Date to check.

    Returns:
        Signal dict or None if not detected.
    """
    # Get latest daily_scores
    daily_rows = _get_daily_scores_series(model_id, days=14)
    if not daily_rows:
        return None

    latest = daily_rows[-1]
    vi_trade = float(latest["vi_trade"])
    delta7 = float(latest.get("delta7_trade") or 0)

    # Must be growing
    if delta7 <= 0:
        return None

    # Adaptive Q threshold: lower in early stage (< 7 days)
    days_available = len(daily_rows)
    q_threshold = 75 if days_available >= 7 else 60

    # Check Q component
    q_score = _get_component_score(model_id, "Q", calc_date)
    if q_score is None or q_score <= q_threshold:
        return None

    # Check G component growing
    g_score = _get_component_score(model_id, "G", calc_date)
    if g_score is None:
        return None

    # Check if G was growing: compare with 7 days ago
    prev_date = calc_date - timedelta(days=7)
    g_prev = _get_component_score(model_id, "G", prev_date)

    if g_prev is not None and g_score <= g_prev:
        return None  # G not growing

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "quality_backed",
        "direction": "bullish",
        "strength": round(min(100, q_score * 0.6 + delta7 * 2), 2),
        "vi_trade": vi_trade,
        "polymarket_odds": 0,
        "divergence_score": 0,
        "reasoning": (
            f"VI_trade growing (d7={delta7:+.1f}), quality Q={q_score:.1f}>{q_threshold}, "
            f"GitHub G={g_score:.1f} trending up. Fundamentally supported."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def run_signal_detection(calc_date: date) -> list[dict[str, Any]]:
    """
    Run all signal detectors for all models, write to signals table.

    Args:
        calc_date: Date to run detection for.

    Returns:
        List of detected signals.
    """
    models = get_all_models()
    client = get_client()

    detectors = [
        detect_divergence,
        detect_momentum_breakout,
        detect_quality_backed,
    ]

    all_signals: list[dict[str, Any]] = []

    for model in models:
        model_id = model["id"]
        slug = model["slug"]

        for detector in detectors:
            try:
                signal = detector(model_id, calc_date)
                if signal is not None:
                    all_signals.append(signal)

                    # Upsert to signals table
                    client.table("signals").upsert(
                        signal,
                        on_conflict="model_id,date,signal_type",
                    ).execute()

                    logger.info(
                        f"  {slug}: {signal['signal_type']} "
                        f"({signal['direction']}, strength={signal['strength']})"
                    )

            except Exception as e:
                logger.error(
                    f"  {slug}: {detector.__name__} failed — {e}"
                )

    logger.info(
        f"Signal detection complete: {len(all_signals)} signals detected "
        f"across {len(models)} models"
    )

    return all_signals
