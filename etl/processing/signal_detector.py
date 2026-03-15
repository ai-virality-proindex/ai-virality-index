"""
Signal Detector for AI Virality Index.

Detects trading signals based on divergence between virality index
components, momentum breakouts, mean-reversion opportunities, and
trend momentum for non-SDK models.

Spec reference: TECHNICAL_SPEC.md section 2.7

Signal types:
    1. divergence — VI_trade momentum diverges from D (Dev Adoption) momentum
    2. momentum_breakout — strong virality spike not backed by adoption growth
    3. mean_reversion — VI dropped but fundamentals remain strong (likely bounce)
    4. trend_momentum — momentum in non-SDK models using T+S+N components
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
    Detect divergence between VI_trade momentum and D (Dev Adoption) momentum.

    If VI_trade is surging but SDK downloads aren't growing (or vice versa),
    that's a meaningful divergence — hype without adoption, or adoption without hype.

    Divergence = z(Delta7(VI_trade)) - z(Delta7(D_component))
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

    # Get D (Dev Adoption) component history from raw_metrics
    d_rows = get_raw_metrics(model_id, "devadoption", "downloads_daily", days=30)
    if len(d_rows) < 8:
        return None

    d_values = [float(r["metric_value"]) for r in d_rows]

    # Calculate delta7 for D component
    d_deltas = []
    for i in range(7, len(d_values)):
        d_deltas.append(d_values[i] - d_values[i - 7])

    if len(d_deltas) < 3:
        return None

    # Z-scores
    z_vi = _z_score(vi_deltas)
    z_d = _z_score(d_deltas)
    divergence = z_vi - z_d

    if abs(divergence) <= 1.5:
        return None

    # Determine direction
    direction = "bullish" if divergence > 0 else "bearish"
    # Bullish: VI rising faster than adoption (hype wave, adoption may follow)
    # Bearish: VI falling but adoption still strong (undervalued)

    current_vi = vi_trade_values[-1]
    current_d = d_values[-1] if d_values else 0

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "divergence",
        "direction": direction,
        "strength": round(min(100, abs(divergence) * 33.3), 2),  # ~1.5->50, 3.0->100
        "vi_trade": current_vi,
        "polymarket_odds": 0,  # legacy field kept for DB schema compat
        "divergence_score": round(divergence, 3),
        "reasoning": (
            f"VI_trade momentum z={z_vi:.2f} vs DevAdoption momentum z={z_d:.2f}. "
            f"Divergence={divergence:.2f} exceeds threshold 1.5."
        ),
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


def detect_momentum_breakout(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect momentum breakout: strong virality not yet backed by adoption growth.

    Uses adaptive thresholds based on available data:
    - With 14+ days: VI > 55, delta7 > 8
    - With 7+ days: VI > 50, delta7 > 5
    - With < 7 days: VI > 45, delta7 > 3

    Acceleration requirement removed (was too restrictive, prevented
    all signals from firing in 28-day validation).

    If Dev Adoption (D) hasn't grown proportionally, the breakout is
    hype-driven and may present a trading opportunity.

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

    # Adaptive thresholds: stricter with more history
    days_available = len(daily_rows)
    if days_available >= 14:
        vi_threshold, delta_threshold = 55, 8
    elif days_available >= 7:
        vi_threshold, delta_threshold = 50, 5
    else:
        vi_threshold, delta_threshold = 45, 3

    # Check VI conditions (accel requirement removed)
    if vi_trade <= vi_threshold or delta7 <= delta_threshold:
        return None

    # Check D (Dev Adoption) movement — did adoption confirm the hype?
    d_rows = get_raw_metrics(model_id, "devadoption", "downloads_daily", days=14)
    d_grew_pct = 0.0
    if len(d_rows) >= 2:
        recent_d = [float(r["metric_value"]) for r in d_rows]
        base = recent_d[0] if recent_d[0] > 0 else 1
        if len(recent_d) >= 8:
            d_grew_pct = ((recent_d[-1] - recent_d[-8]) / base) * 100
        else:
            d_grew_pct = ((recent_d[-1] - recent_d[0]) / base) * 100

    if d_grew_pct >= 10.0:
        return None  # Adoption already confirmed the hype

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "momentum_breakout",
        "direction": "bullish",
        "strength": round(min(100, vi_trade * 0.5 + delta7 * 2), 2),
        "vi_trade": vi_trade,
        "polymarket_odds": 0,  # legacy field kept for DB schema compat
        "divergence_score": round(delta7, 3),
        "reasoning": (
            f"VI_trade={vi_trade:.1f}>{vi_threshold}, delta7={delta7:+.1f}>{delta_threshold}, "
            f"but DevAdoption grew only {d_grew_pct:+.1f}%."
        ),
        "expires_at": (calc_date + timedelta(days=5)).isoformat(),
    }


def detect_mean_reversion(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect mean-reversion opportunity: VI dropped significantly but
    fundamentals (D, G) remain strong.

    Conditions:
    - delta7 < -5 (VI declining)
    - D component > 40 (still has real adoption)
    - direction: "bullish" (oversold, likely to recover)

    For non-SDK models (D=0): use T+N threshold instead
    - delta7 < -5
    - T > 30 OR N > 40 (still has search/news presence)
    - direction: "bullish"

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

    # Must be declining
    if delta7 >= -5:
        return None

    # Check D component (Dev Adoption — npm + PyPI downloads)
    d_score = _get_component_score(model_id, "D", calc_date)

    if d_score is not None and d_score > 40:
        # SDK model with strong adoption fundamentals
        strength = round(min(100, abs(delta7) * 3 + d_score * 0.3), 2)
        reasoning = (
            f"VI_trade declining (d7={delta7:+.1f}), but DevAdoption D={d_score:.1f}>40. "
            f"Mean reversion likely — fundamentals remain strong."
        )
    else:
        # Non-SDK model or D<=40: use T+N threshold
        t_score = _get_component_score(model_id, "T", calc_date)
        n_score = _get_component_score(model_id, "N", calc_date)

        t_val = t_score if t_score is not None else 0
        n_val = n_score if n_score is not None else 0

        if t_val <= 30 and n_val <= 40:
            return None  # No fundamental support

        best_score = max(t_val, n_val)
        strength = round(min(100, abs(delta7) * 3 + best_score * 0.3), 2)
        reasoning = (
            f"VI_trade declining (d7={delta7:+.1f}), no SDK data but "
            f"T={t_val:.1f}, N={n_val:.1f} show continued presence. "
            f"Mean reversion likely."
        )

    return {
        "model_id": model_id,
        "date": calc_date.isoformat(),
        "signal_type": "mean_reversion",
        "direction": "bullish",
        "strength": strength,
        "vi_trade": vi_trade,
        "polymarket_odds": 0,  # legacy field kept for DB schema compat
        "divergence_score": 0,
        "reasoning": reasoning,
        "expires_at": (calc_date + timedelta(days=7)).isoformat(),
    }


# Backward-compatible alias
detect_quality_backed = detect_mean_reversion


def detect_trend_momentum(
    model_id: str,
    calc_date: date,
) -> dict[str, Any] | None:
    """
    Detect momentum in non-adoption models using T+S+N components.
    Targets: Copilot, Grok, Perplexity (D=0 models).

    Bullish: T growing AND (N > 40 OR S > 30), delta7 > 3
    Bearish: T declining AND N < 20 AND S < 20, delta7 < -3

    For models with D > 0, this signal is skipped (they have better
    signals via divergence and mean_reversion).

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

    # Skip models that have D > 0 (they use divergence/mean_reversion)
    d_score = _get_component_score(model_id, "D", calc_date)
    if d_score is not None and d_score > 0:
        return None

    # Get T, S, N components
    t_score = _get_component_score(model_id, "T", calc_date)
    s_score = _get_component_score(model_id, "S", calc_date)
    n_score = _get_component_score(model_id, "N", calc_date)

    t_val = t_score if t_score is not None else 0
    s_val = s_score if s_score is not None else 0
    n_val = n_score if n_score is not None else 0

    # Check T trend: compare with 7 days ago
    t_prev = _get_component_score(model_id, "T", calc_date - timedelta(days=7))
    t_prev_val = t_prev if t_prev is not None else t_val
    t_growing = t_val > t_prev_val
    t_declining = t_val < t_prev_val

    # Bullish conditions
    if delta7 > 3 and t_growing and (n_val > 40 or s_val > 30):
        best_component = max(t_val, s_val, n_val)
        strength = round(min(100, delta7 * 4 + best_component * 0.3), 2)
        return {
            "model_id": model_id,
            "date": calc_date.isoformat(),
            "signal_type": "trend_momentum",
            "direction": "bullish",
            "strength": strength,
            "vi_trade": vi_trade,
            "polymarket_odds": 0,
            "divergence_score": 0,
            "reasoning": (
                f"Non-SDK model trending up (d7={delta7:+.1f}). "
                f"T={t_val:.1f} growing, S={s_val:.1f}, N={n_val:.1f}. "
                f"Momentum supported by search/social/news presence."
            ),
            "expires_at": (calc_date + timedelta(days=5)).isoformat(),
        }

    # Bearish conditions
    if delta7 < -3 and t_declining and n_val < 20 and s_val < 20:
        strength = round(min(100, abs(delta7) * 4 + (40 - max(t_val, s_val, n_val)) * 0.5), 2)
        return {
            "model_id": model_id,
            "date": calc_date.isoformat(),
            "signal_type": "trend_momentum",
            "direction": "bearish",
            "strength": strength,
            "vi_trade": vi_trade,
            "polymarket_odds": 0,
            "divergence_score": 0,
            "reasoning": (
                f"Non-SDK model declining (d7={delta7:+.1f}). "
                f"T={t_val:.1f} declining, S={s_val:.1f}<20, N={n_val:.1f}<20. "
                f"No component support — continued decline likely."
            ),
            "expires_at": (calc_date + timedelta(days=5)).isoformat(),
        }

    return None


def _resolve_signal_conflicts(
    signals: list[dict[str, Any]],
    model_slug: str,
) -> list[dict[str, Any]]:
    """
    Resolve contradictory signals for the same model on the same date.

    If both bullish and bearish signals exist, keep only the one with
    higher strength. Log the conflict.

    Args:
        signals: List of signals for a single model on a single date.
        model_slug: Model slug for logging.

    Returns:
        Filtered list of signals with conflicts resolved.
    """
    if len(signals) <= 1:
        return signals

    bullish = [s for s in signals if s["direction"] == "bullish"]
    bearish = [s for s in signals if s["direction"] == "bearish"]

    if not bullish or not bearish:
        return signals  # No conflict

    best_bullish = max(bullish, key=lambda s: s["strength"])
    best_bearish = max(bearish, key=lambda s: s["strength"])

    logger.warning(
        f"  {model_slug}: CONFLICT — bullish ({best_bullish['signal_type']}, "
        f"str={best_bullish['strength']}) vs bearish ({best_bearish['signal_type']}, "
        f"str={best_bearish['strength']})"
    )

    if best_bullish["strength"] >= best_bearish["strength"]:
        winner_direction = "bullish"
        logger.info(f"  {model_slug}: Resolved conflict -> bullish wins")
    else:
        winner_direction = "bearish"
        logger.info(f"  {model_slug}: Resolved conflict -> bearish wins")

    return [s for s in signals if s["direction"] == winner_direction]


def run_signal_detection(calc_date: date) -> list[dict[str, Any]]:
    """
    Run all signal detectors for all models, write to signals table.

    After collecting signals per model, resolves contradictions
    (bullish vs bearish) by keeping only the stronger direction.

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
        detect_mean_reversion,
        detect_trend_momentum,
    ]

    all_signals: list[dict[str, Any]] = []

    for model in models:
        model_id = model["id"]
        slug = model["slug"]

        model_signals: list[dict[str, Any]] = []

        for detector in detectors:
            try:
                signal = detector(model_id, calc_date)
                if signal is not None:
                    model_signals.append(signal)
            except Exception as e:
                logger.error(
                    f"  {slug}: {detector.__name__} failed — {e}"
                )

        # Resolve conflicts before writing
        model_signals = _resolve_signal_conflicts(model_signals, slug)

        for signal in model_signals:
            try:
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
                    f"  {slug}: upsert {signal['signal_type']} failed — {e}"
                )

        all_signals.extend(model_signals)

    logger.info(
        f"Signal detection complete: {len(all_signals)} signals detected "
        f"across {len(models)} models"
    )

    return all_signals
