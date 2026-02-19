"""
Index Calculator for AI Virality Index.

Computes the composite VI_trade and VI_content scores (0-100) for each model,
along with momentum (delta7, acceleration) and trading signals.

Spec reference: TECHNICAL_SPEC.md sections 2.6 and 2.7

Component mapping:
    T: source='trends',      metric='interest'
    S: source in ('youtube','hackernews'), averaged
    G: source='github',      'stars_delta_1d' + 'forks_delta_1d'
    N: source='gdelt',       'article_count'
    D: source='devadoption', 'downloads_daily' (was Q: arena/elo_rating)
    M: source='wikipedia',   'pageviews_7d'

Weights:
    Trading: 0.18*T + 0.28*S + 0.15*G + 0.12*N + 0.15*D + 0.12*M
    Content: 0.25*T + 0.35*S + 0.05*G + 0.20*N + 0.05*D + 0.10*M
"""

import logging
from datetime import date, timedelta
from typing import Any

from etl.config import (
    WEIGHTS_TRADE,
    WEIGHTS_CONTENT,
    EWMA_ALPHA_TRADE as ALPHA_TRADE,
    EWMA_ALPHA_CONTENT as ALPHA_CONTENT,
)
from etl.processing.normalizer import quantile_normalize, cross_model_normalize
from etl.processing.smoother import ewma
from etl.storage.supabase_client import (
    get_client,
    get_all_models,
    get_raw_metrics,
)

logger = logging.getLogger(__name__)

# ----- Component Data Fetchers -----

# Each component: (source, metric_name) tuples.
# S (Social) is special: average of youtube + hackernews.
COMPONENT_SOURCES = {
    "T": [("trends", "interest")],
    "S": [("youtube", "total_views_24h"), ("hackernews", "stories_24h")],
    "G": [("github", "stars_delta_1d"), ("github", "forks_delta_1d")],
    "N": [("gdelt", "article_count")],
    "D": [("devadoption", "downloads_daily")],
    "M": [("wikipedia", "pageviews_7d")],
}


def _fetch_component_history(
    model_id: str,
    component: str,
    days: int = 90,
) -> list[float]:
    """
    Fetch raw metric history for a component, merging multiple sources if needed.

    For multi-source components (S, G), values from the same date are summed (G)
    or averaged (S).

    Returns:
        List of float values ordered by date ascending.
    """
    sources = COMPONENT_SOURCES[component]

    if len(sources) == 1:
        source, metric_name = sources[0]
        rows = get_raw_metrics(model_id, source, metric_name, days=days)
        return [float(r["metric_value"]) for r in rows]

    # Multi-source: fetch each, align by date, then combine
    from collections import defaultdict

    date_values: dict[str, list[float]] = defaultdict(list)

    for source, metric_name in sources:
        rows = get_raw_metrics(model_id, source, metric_name, days=days)
        for r in rows:
            date_values[r["date"]].append(float(r["metric_value"]))

    if not date_values:
        return []

    # Sort by date and combine
    sorted_dates = sorted(date_values.keys())

    if component == "G":
        # GitHub: sum stars_delta + forks_delta
        return [sum(date_values[d]) for d in sorted_dates]
    else:
        # Social (S): average across sources
        return [sum(date_values[d]) / len(date_values[d]) for d in sorted_dates]


def calculate_index(
    model_id: str,
    calc_date: date,
    mode: str = "trade",
) -> dict[str, Any]:
    """
    Calculate the composite index for a model on a given date.

    Steps:
        1. Query raw_metrics for last 90 days per component
        2. Normalize each component (quantile scaling -> 0-100)
        3. Smooth with EWMA
        4. Apply weighted sum

    Args:
        model_id: UUID of the model.
        calc_date: Date for which to calculate the index.
        mode: 'trade' or 'content'.

    Returns:
        Dict with:
            vi_score: float (0-100),
            components: {T: float, S: float, G: float, N: float, D: float, M: float},
            smoothed_components: {T: float, ...},
    """
    weights = WEIGHTS_TRADE if mode == "trade" else WEIGHTS_CONTENT
    alpha = ALPHA_TRADE if mode == "trade" else ALPHA_CONTENT

    components_raw: dict[str, float] = {}
    components_normalized: dict[str, float] = {}
    components_smoothed: dict[str, float] = {}

    for comp_code in ["T", "S", "G", "N", "D", "M"]:
        history = _fetch_component_history(model_id, comp_code, days=90)

        if not history:
            # No data for this component: default to 0 (no signal)
            # Previously defaulted to 50 which was misleading — models
            # without a data source (e.g. Perplexity has no GitHub repos)
            # appeared to have average activity when they had none.
            components_raw[comp_code] = 0.0
            components_normalized[comp_code] = 0.0
            components_smoothed[comp_code] = 0.0
            continue

        # Raw value is the latest
        components_raw[comp_code] = history[-1]

        # Normalize
        normalized = quantile_normalize(history)
        components_normalized[comp_code] = normalized

        # Smooth: normalize each point using a 90-day rolling window, then EWMA
        if len(history) > 1:
            all_normalized = []
            for i in range(len(history)):
                window_start = max(0, i - 89)  # 90-day rolling window
                window = history[window_start:i + 1]
                all_normalized.append(quantile_normalize(window, current_value=history[i]))
            smoothed_series = ewma(all_normalized, alpha=alpha)
            components_smoothed[comp_code] = smoothed_series[-1]
        else:
            components_smoothed[comp_code] = normalized

    # Weighted sum
    vi_score = sum(
        weights[c] * components_smoothed[c]
        for c in ["T", "S", "G", "N", "D", "M"]
    )
    vi_score = round(max(0.0, min(100.0, vi_score)), 2)

    return {
        "vi_score": vi_score,
        "components_raw": components_raw,
        "components_normalized": components_normalized,
        "components_smoothed": components_smoothed,
    }


def calculate_momentum(
    scores: list[float],
) -> dict[str, float]:
    """
    Calculate 7-day momentum and acceleration from a series of daily scores.

    Delta7(x) = x(t) - x(t-7)
    Accel(x)  = Delta7(x) - Delta7(x, t-7) = Delta7(t) - Delta7(t-7)

    Args:
        scores: List of daily scores, ordered by date ascending.
                Needs at least 8 values for delta7, 15 for acceleration.

    Returns:
        Dict with 'delta7' and 'acceleration'. Both 0.0 if not enough data.
    """
    if len(scores) < 8:
        return {"delta7": 0.0, "acceleration": 0.0}

    delta7 = scores[-1] - scores[-8]  # t vs t-7

    if len(scores) < 15:
        return {"delta7": round(delta7, 2), "acceleration": 0.0}

    delta7_prev = scores[-8] - scores[-15]  # (t-7) vs (t-14)
    acceleration = delta7 - delta7_prev

    return {
        "delta7": round(delta7, 2),
        "acceleration": round(acceleration, 2),
    }


def calculate_signal_trade(
    vi_trade: float,
    delta7: float,
    acceleration: float,
) -> float:
    """
    Calculate the Trading Signal composite score.

    Signal_trade = 0.60 * VI_trade + 0.25 * norm(delta7) + 0.15 * norm(accel)

    norm() here maps the raw delta/accel to 0-100:
      - delta7 range: roughly -50 to +50 -> clamp and scale
      - acceleration range: roughly -30 to +30 -> clamp and scale

    Args:
        vi_trade: VI trading score (0-100).
        delta7: 7-day momentum.
        acceleration: Momentum acceleration.

    Returns:
        Signal score in [0, 100].
    """
    # Normalize delta7: [-50, +50] -> [0, 100]
    norm_delta7 = _normalize_momentum(delta7, max_abs=50.0)

    # Normalize acceleration: [-30, +30] -> [0, 100]
    norm_accel = _normalize_momentum(acceleration, max_abs=30.0)

    signal = 0.60 * vi_trade + 0.25 * norm_delta7 + 0.15 * norm_accel
    return round(max(0.0, min(100.0, signal)), 2)


def calculate_heat_content(
    vi_content: float,
    delta7: float,
) -> float:
    """
    Calculate the Content Heat score.

    Heat_content = 0.50 * VI_content + 0.50 * norm(Delta7(VI_content))

    Args:
        vi_content: VI content score (0-100).
        delta7: 7-day momentum of content score.

    Returns:
        Heat score in [0, 100].
    """
    norm_delta7 = _normalize_momentum(delta7, max_abs=50.0)
    heat = 0.50 * vi_content + 0.50 * norm_delta7
    return round(max(0.0, min(100.0, heat)), 2)


def _normalize_momentum(value: float, max_abs: float = 50.0) -> float:
    """
    Normalize a momentum value (can be negative) to 0-100.

    Maps [-max_abs, +max_abs] to [0, 100], with clamping.
    0 maps to 50 (neutral).
    """
    clamped = max(-max_abs, min(value, max_abs))
    return 50.0 + (clamped / max_abs) * 50.0


def _get_daily_scores_history(
    model_id: str,
    column: str,
    days: int = 30,
) -> list[float]:
    """
    Fetch historical daily_scores for momentum calculation.

    Args:
        model_id: UUID of the model.
        column: Column to fetch ('vi_trade' or 'vi_content').
        days: Number of days to look back.

    Returns:
        List of scores, ordered by date ascending.
    """
    client = get_client()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    result = (
        client.table("daily_scores")
        .select(f"date, {column}")
        .eq("model_id", model_id)
        .gte("date", start_date)
        .order("date", desc=False)
        .execute()
    )
    return [float(r[column]) for r in result.data if r[column] is not None]


def _needs_cross_model(model_id: str, component: str, days: int = 90) -> bool:
    """Check if a component has less than 7 days of history (needs cross-model norm)."""
    history = _fetch_component_history(model_id, component, days=days)
    return len(history) < 7


def run_daily_calculation(calc_date: date) -> dict[str, Any]:
    """
    Run the full daily index calculation for all active models.

    Two-phase normalization:
        Phase 1: Per-model quantile normalization (works well with 7+ days data)
        Phase 2: Cross-model ranking for components with < 7 days history.
                 Replaces per-model normalized values with cross-model scores.

    For each model:
        1. Calculate VI_trade and VI_content (phase 1)
        2. Apply cross-model normalization (phase 2) for sparse components
        3. Recalculate weighted VI scores with corrected component values
        4. Write component_scores and daily_scores to Supabase

    Args:
        calc_date: The date to calculate for.

    Returns:
        Summary dict.
    """
    models = get_all_models()
    client = get_client()

    logger.info(f"Running daily calculation for {calc_date} — {len(models)} models")

    # ---- Phase 1: Per-model calculation ----
    phase1_results: dict[str, dict] = {}  # model_id -> {trade_result, content_result}

    for model in models:
        model_id = model["id"]
        slug = model["slug"]
        try:
            trade_result = calculate_index(model_id, calc_date, mode="trade")
            content_result = calculate_index(model_id, calc_date, mode="content")
            phase1_results[model_id] = {
                "slug": slug,
                "trade": trade_result,
                "content": content_result,
            }
        except Exception as e:
            logger.error(f"  {slug}: Phase 1 FAILED — {e}")
            phase1_results[model_id] = {"slug": slug, "error": str(e)}

    # ---- Phase 2: Cross-model normalization for sparse components ----
    # Check which components need cross-model normalization
    # (use first model to check history length; all models have same date range)
    sparse_components: set[str] = set()
    for comp_code in ["T", "S", "G", "N", "D", "M"]:
        for model in models:
            model_id = model["id"]
            if model_id in phase1_results and "error" not in phase1_results[model_id]:
                if _needs_cross_model(model_id, comp_code):
                    sparse_components.add(comp_code)
                break  # Only need to check one model per component

    if sparse_components:
        logger.info(f"  Cross-model normalization for sparse components: {sparse_components}")

    # Build cross-model scores for sparse components
    cross_scores: dict[str, dict[str, float]] = {}  # comp -> {model_id -> score}
    for comp_code in sparse_components:
        raw_values: dict[str, float] = {}
        for model_id, p1 in phase1_results.items():
            if "error" in p1:
                continue
            raw_values[model_id] = p1["trade"]["components_raw"].get(comp_code, 0.0)
        cross_scores[comp_code] = cross_model_normalize(raw_values)

    # ---- Phase 3: Merge and write results ----
    weights_trade = WEIGHTS_TRADE
    weights_content = WEIGHTS_CONTENT
    alpha_trade = ALPHA_TRADE
    alpha_content = ALPHA_CONTENT
    results = []

    for model in models:
        model_id = model["id"]
        slug = model["slug"]
        p1 = phase1_results.get(model_id, {})

        if "error" in p1:
            results.append({"model": slug, "status": f"ERROR: {p1['error']}"})
            continue

        try:
            trade_result = p1["trade"]
            content_result = p1["content"]

            # Override normalized values for sparse components
            for comp_code in sparse_components:
                if comp_code in cross_scores and model_id in cross_scores[comp_code]:
                    cross_val = cross_scores[comp_code][model_id]
                    trade_result["components_normalized"][comp_code] = cross_val
                    trade_result["components_smoothed"][comp_code] = cross_val
                    content_result["components_normalized"][comp_code] = cross_val
                    content_result["components_smoothed"][comp_code] = cross_val

            # Recalculate VI scores with corrected component values
            vi_trade = sum(
                weights_trade[c] * trade_result["components_smoothed"][c]
                for c in ["T", "S", "G", "N", "D", "M"]
            )
            vi_trade = round(max(0.0, min(100.0, vi_trade)), 2)

            vi_content = sum(
                weights_content[c] * content_result["components_smoothed"][c]
                for c in ["T", "S", "G", "N", "D", "M"]
            )
            vi_content = round(max(0.0, min(100.0, vi_content)), 2)

            # Upsert component scores
            for comp_code in ["T", "S", "G", "N", "D", "M"]:
                comp_row = {
                    "model_id": model_id,
                    "date": calc_date.isoformat(),
                    "component": comp_code,
                    "raw_value": trade_result["components_raw"].get(comp_code, 0),
                    "normalized_value": trade_result["components_normalized"].get(comp_code, 0),
                    "smoothed_value": trade_result["components_smoothed"].get(comp_code, 0),
                }
                client.table("component_scores").upsert(
                    comp_row,
                    on_conflict="model_id,date,component",
                ).execute()

            # Fetch historical scores for momentum
            trade_history = _get_daily_scores_history(model_id, "vi_trade", days=30)
            content_history = _get_daily_scores_history(model_id, "vi_content", days=30)

            # Add today's scores to history for momentum calc
            trade_history.append(vi_trade)
            content_history.append(vi_content)

            # Momentum
            trade_momentum = calculate_momentum(trade_history)
            content_momentum = calculate_momentum(content_history)

            # Trading signal and content heat
            signal_trade = calculate_signal_trade(
                vi_trade,
                trade_momentum["delta7"],
                trade_momentum["acceleration"],
            )
            heat_content = calculate_heat_content(
                vi_content,
                content_momentum["delta7"],
            )

            # Build component breakdown JSON
            breakdown = {}
            for comp_code in ["T", "S", "G", "N", "D", "M"]:
                breakdown[comp_code] = trade_result["components_smoothed"].get(comp_code, 0)

            # Upsert daily scores
            daily_row = {
                "model_id": model_id,
                "date": calc_date.isoformat(),
                "vi_trade": vi_trade,
                "vi_content": vi_content,
                "signal_trade": signal_trade,
                "heat_content": heat_content,
                "delta7_trade": trade_momentum["delta7"],
                "delta7_content": content_momentum["delta7"],
                "accel_trade": trade_momentum["acceleration"],
                "accel_content": content_momentum["acceleration"],
                "component_breakdown": breakdown,
            }
            client.table("daily_scores").upsert(
                daily_row,
                on_conflict="model_id,date",
            ).execute()

            results.append({
                "model": slug,
                "vi_trade": vi_trade,
                "vi_content": vi_content,
                "signal_trade": signal_trade,
                "heat_content": heat_content,
                "delta7_trade": trade_momentum["delta7"],
                "status": "OK",
            })

            logger.info(
                f"  {slug}: VI_trade={vi_trade:.1f} VI_content={vi_content:.1f} "
                f"Signal={signal_trade:.1f} Heat={heat_content:.1f} "
                f"d7={trade_momentum['delta7']:+.1f}"
            )

        except Exception as e:
            logger.error(f"  {slug}: FAILED — {e}")
            results.append({"model": slug, "status": f"ERROR: {e}"})

    ok_count = sum(1 for r in results if r["status"] == "OK")
    logger.info(
        f"Index calculation complete: {ok_count}/{len(models)} models OK"
    )

    return {
        "date": calc_date.isoformat(),
        "models_calculated": ok_count,
        "models_total": len(models),
        "details": results,
    }
