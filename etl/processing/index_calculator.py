"""
Index Calculator for AI Virality Index.

Computes the composite VI score (0-100) for each model,
along with momentum (delta7, acceleration).

v0.2: Single 5-component formula (D dropped from weighted sum).
D data still collected and stored in component_scores for reference.

Component mapping:
    T: source='trends',      metric='interest'
    S: source in ('youtube','hackernews'), averaged
    G: source='github',      'stars_delta_1d' + 'forks_delta_1d'
    N: source='gdelt',       'article_count'
    M: source='wikipedia',   'pageviews_7d'
    D: source='devadoption', 'downloads_daily' (collected but NOT in formula)

Formula: VI = 0.25*T + 0.25*S + 0.10*G + 0.25*N + 0.15*M
For models without GitHub (Copilot, Perplexity): G weight redistributed.
"""

import logging
from datetime import date, timedelta
from typing import Any

from etl.config import (
    WEIGHTS,
    EWMA_ALPHA as ALPHA,
    D_RAW_MIN_THRESHOLD,
    get_weights_for_model,
)

# Components included in the VI formula
FORMULA_COMPONENTS = ["T", "S", "G", "N", "M"]
# All components collected (D still tracked but not in formula)
ALL_COMPONENTS = ["T", "S", "G", "N", "D", "M"]
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

    v0.2: Single 5-component formula. D is still collected/normalized
    but excluded from the weighted sum.

    Steps:
        1. Query raw_metrics for last 90 days per component
        2. Normalize each component (quantile scaling -> 0-100)
        3. Smooth with EWMA
        4. Apply weighted sum (T, S, G, N, M only)

    Args:
        model_id: UUID of the model.
        calc_date: Date for which to calculate the index.
        mode: Ignored in v0.2 (single formula). Kept for backward compat.

    Returns:
        Dict with:
            vi_score: float (0-100),
            components: {T, S, G, N, D, M},
            smoothed_components: {T, S, G, N, D, M},
    """
    alpha = ALPHA

    components_raw: dict[str, float] = {}
    components_normalized: dict[str, float] = {}
    components_smoothed: dict[str, float] = {}

    for comp_code in ALL_COMPONENTS:
        history = _fetch_component_history(model_id, comp_code, days=90)

        if not history:
            components_raw[comp_code] = 0.0
            components_normalized[comp_code] = 0.0
            components_smoothed[comp_code] = 0.0
            continue

        # Raw value is the latest
        components_raw[comp_code] = history[-1]

        # D component: enforce minimum absolute threshold
        if comp_code == "D" and history[-1] < D_RAW_MIN_THRESHOLD:
            components_raw[comp_code] = history[-1]
            components_normalized[comp_code] = 0.0
            components_smoothed[comp_code] = 0.0
            continue

        # Normalize
        normalized = quantile_normalize(history)
        components_normalized[comp_code] = normalized

        # Smooth: normalize each point using a 90-day rolling window, then EWMA
        if len(history) > 1:
            all_normalized = []
            for i in range(len(history)):
                window_start = max(0, i - 89)
                window = history[window_start:i + 1]
                all_normalized.append(quantile_normalize(window, current_value=history[i]))
            smoothed_series = ewma(all_normalized, alpha=alpha)
            components_smoothed[comp_code] = smoothed_series[-1]
        else:
            components_smoothed[comp_code] = normalized

    # Weighted sum — only formula components (T, S, G, N, M), NOT D
    vi_score = sum(
        WEIGHTS.get(c, 0) * components_smoothed[c]
        for c in FORMULA_COMPONENTS
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

    # Load models_config to determine which models have GitHub repos
    import yaml
    from etl.config import MODELS_CONFIG_PATH

    models_config = {}
    try:
        with open(MODELS_CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        models_config = cfg.get("models", {})
    except Exception as e:
        logger.warning(f"Could not load models_config.yaml: {e}")

    def _model_has_github(slug: str) -> bool:
        """Check if model has GitHub repos (non-empty github_repos)."""
        model_cfg = models_config.get(slug, {})
        repos = model_cfg.get("github_repos", [])
        return bool(repos)

    logger.info(f"Running daily calculation for {calc_date} — {len(models)} models")

    # ---- Phase 1: Per-model calculation (single formula) ----
    phase1_results: dict[str, dict] = {}  # model_id -> {result}

    for model in models:
        model_id = model["id"]
        slug = model["slug"]
        try:
            result = calculate_index(model_id, calc_date)
            phase1_results[model_id] = {
                "slug": slug,
                "result": result,
            }
        except Exception as e:
            logger.error(f"  {slug}: Phase 1 FAILED — {e}")
            phase1_results[model_id] = {"slug": slug, "error": str(e)}

    # ---- Phase 2: Cross-model normalization for sparse components ----
    sparse_components: set[str] = set()
    for comp_code in ALL_COMPONENTS:
        for model in models:
            model_id = model["id"]
            if model_id in phase1_results and "error" not in phase1_results[model_id]:
                if _needs_cross_model(model_id, comp_code):
                    sparse_components.add(comp_code)
                break

    if sparse_components:
        logger.info(f"  Cross-model normalization for sparse components: {sparse_components}")

    cross_scores: dict[str, dict[str, float]] = {}
    for comp_code in sparse_components:
        raw_values: dict[str, float] = {}
        for model_id, p1 in phase1_results.items():
            if "error" in p1:
                continue
            raw_values[model_id] = p1["result"]["components_raw"].get(comp_code, 0.0)
        cross_scores[comp_code] = cross_model_normalize(raw_values)

    # ---- Phase 3: Merge and write results ----
    results = []

    for model in models:
        model_id = model["id"]
        slug = model["slug"]
        p1 = phase1_results.get(model_id, {})

        if "error" in p1:
            results.append({"model": slug, "status": f"ERROR: {p1['error']}"})
            continue

        try:
            calc_result = p1["result"]

            # Per-model weights: redistribute G weight for models without GitHub
            has_github = _model_has_github(slug)
            weights = get_weights_for_model(has_github=has_github)

            if not has_github:
                logger.info(f"  {slug}: no GitHub repos, using redistributed weights (G=0)")

            # Override normalized values for sparse components
            for comp_code in sparse_components:
                if comp_code in cross_scores and model_id in cross_scores[comp_code]:
                    cross_val = cross_scores[comp_code][model_id]
                    calc_result["components_normalized"][comp_code] = cross_val
                    calc_result["components_smoothed"][comp_code] = cross_val

            # Recalculate VI score with corrected component values (5 components)
            vi_score = sum(
                weights.get(c, 0) * calc_result["components_smoothed"][c]
                for c in FORMULA_COMPONENTS
            )
            vi_score = round(max(0.0, min(100.0, vi_score)), 2)

            # Upsert component scores (all 6, including D for reference)
            for comp_code in ALL_COMPONENTS:
                comp_row = {
                    "model_id": model_id,
                    "date": calc_date.isoformat(),
                    "component": comp_code,
                    "raw_value": calc_result["components_raw"].get(comp_code, 0),
                    "normalized_value": calc_result["components_normalized"].get(comp_code, 0),
                    "smoothed_value": calc_result["components_smoothed"].get(comp_code, 0),
                }
                client.table("component_scores").upsert(
                    comp_row,
                    on_conflict="model_id,date,component",
                ).execute()

            # Fetch historical scores for momentum
            vi_history = _get_daily_scores_history(model_id, "vi_trade", days=30)
            vi_history.append(vi_score)
            momentum = calculate_momentum(vi_history)

            # Signal/heat scores (kept for backward compat in DB)
            signal_trade = calculate_signal_trade(
                vi_score, momentum["delta7"], momentum["acceleration"],
            )
            heat_content = calculate_heat_content(
                vi_score, momentum["delta7"],
            )

            # Build component breakdown JSON
            breakdown = {}
            for comp_code in ALL_COMPONENTS:
                breakdown[comp_code] = calc_result["components_smoothed"].get(comp_code, 0)

            # Upsert daily scores — vi_trade = vi_content = VI (backward compat)
            daily_row = {
                "model_id": model_id,
                "date": calc_date.isoformat(),
                "vi_trade": vi_score,
                "vi_content": vi_score,  # same as vi_trade in v0.2
                "signal_trade": signal_trade,
                "heat_content": heat_content,
                "delta7_trade": momentum["delta7"],
                "delta7_content": momentum["delta7"],  # same
                "accel_trade": momentum["acceleration"],
                "accel_content": momentum["acceleration"],  # same
                "component_breakdown": breakdown,
            }
            client.table("daily_scores").upsert(
                daily_row,
                on_conflict="model_id,date",
            ).execute()

            results.append({
                "model": slug,
                "vi_trade": vi_score,
                "vi_content": vi_score,
                "signal_trade": signal_trade,
                "heat_content": heat_content,
                "delta7_trade": momentum["delta7"],
                "status": "OK",
            })

            logger.info(
                f"  {slug}: VI={vi_score:.1f} "
                f"d7={momentum['delta7']:+.1f}"
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
