"""
Normalizer module for AI Virality Index.

Implements rolling quantile normalization (q05/q95) with winsorization.
Converts raw metric values into 0-100 scores that are outlier-resistant.

Spec reference: TECHNICAL_SPEC.md section 2.4
"""

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def quantile_normalize(
    values: list[float],
    current_value: Optional[float] = None,
    window: int = 90,
    q_low: float = 0.05,
    q_high: float = 0.95,
) -> float:
    """
    Normalize a value using rolling quantile scaling.

    Algorithm:
        1. Take the last `window` values
        2. Compute q05 and q95 quantiles
        3. Winsorize: clip current value to [q05, q95]
        4. Scale to 0-100: score = 100 * (clipped - q05) / (q95 - q05)

    Edge cases:
        - All same values (q05 == q95): return 50.0
        - Less than 7 days history: use min-max fallback
        - Empty values: return 50.0

    Args:
        values: Historical values (ordered by date ascending).
        current_value: Value to normalize. If None, uses the last element of values.
        window: Rolling window size in days (default 90).
        q_low: Lower quantile boundary (default 0.05).
        q_high: Upper quantile boundary (default 0.95).

    Returns:
        Normalized score in [0, 100] range.
    """
    if not values:
        logger.warning("Empty values list, returning default 50.0")
        return 50.0

    # Use last element if current_value not specified
    if current_value is None:
        current_value = values[-1]

    # Take rolling window
    window_values = values[-window:]
    arr = np.array(window_values, dtype=np.float64)

    # Remove NaN/inf
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return 50.0

    # Edge case: too little history — use min-max fallback
    if len(arr) < 7:
        return _minmax_normalize(arr, current_value)

    # Compute quantiles
    q05 = float(np.quantile(arr, q_low))
    q95 = float(np.quantile(arr, q_high))

    # Edge case: all same values
    if q95 == q05:
        # If all zeros → no signal → return 0.
        # If non-zero identical values → return 50 (neutral).
        if q95 == 0.0:
            return 0.0
        return 50.0

    # Winsorize (clip to quantile range)
    clipped = max(q05, min(current_value, q95))

    # Scale to 0-100
    score = 100.0 * (clipped - q05) / (q95 - q05)

    return round(max(0.0, min(100.0, score)), 2)


def _minmax_normalize(arr: np.ndarray, current_value: float) -> float:
    """
    Min-max fallback normalization for when history is too short.

    Args:
        arr: Array of historical values.
        current_value: Value to normalize.

    Returns:
        Score in [0, 100] range.
    """
    vmin = float(arr.min())
    vmax = float(arr.max())

    if vmax == vmin:
        # All values identical — no variance to normalize against.
        # If all zeros → no signal → return 0.
        # If non-zero identical values → we have data but too little
        # history for meaningful normalization → return 50 (neutral).
        if vmax == 0.0:
            return 0.0
        return 50.0

    clipped = max(vmin, min(current_value, vmax))
    score = 100.0 * (clipped - vmin) / (vmax - vmin)
    return round(max(0.0, min(100.0, score)), 2)


def normalize_batch(
    values_by_model: dict[str, list[float]],
    window: int = 90,
) -> dict[str, float]:
    """
    Normalize the latest value for each model using their own history.

    Args:
        values_by_model: Dict mapping model_slug -> list of historical values.
        window: Rolling window size.

    Returns:
        Dict mapping model_slug -> normalized score (0-100).
    """
    results = {}
    for slug, values in values_by_model.items():
        if not values:
            results[slug] = 50.0
        else:
            results[slug] = quantile_normalize(values, window=window)
    return results


def cross_model_normalize(
    values_by_model: dict[str, float],
) -> dict[str, float]:
    """
    Cross-model normalization: rank models relative to each other.

    Used when temporal history is too short for per-model quantile
    normalization (< 7 days). Instead of normalizing each model by its
    own history, we compare all models' current values against each other.

    Algorithm:
        1. Collect all non-zero values across models
        2. If < 2 distinct non-zero values → return per-model defaults
        3. Scale to 0-100 using min-max across models
        4. Zero-value models get 0 (no signal)

    Args:
        values_by_model: Dict mapping model_id -> current raw value.

    Returns:
        Dict mapping model_id -> normalized score (0-100).
    """
    if not values_by_model:
        return {}

    # Separate zeros from non-zeros
    nonzero_vals = {k: v for k, v in values_by_model.items() if v > 0}
    zero_models = {k for k, v in values_by_model.items() if v <= 0}

    results: dict[str, float] = {}

    # All zeros → all get 0
    if not nonzero_vals:
        return {k: 0.0 for k in values_by_model}

    # Only one model with data → it gets 50 (can't rank against itself)
    if len(nonzero_vals) == 1:
        for k in values_by_model:
            results[k] = 50.0 if k in nonzero_vals else 0.0
        return results

    # Cross-model min-max: spread across 10-100 range (not 0-100)
    # to visually distinguish from "no data" (0)
    vals = list(nonzero_vals.values())
    vmin = min(vals)
    vmax = max(vals)

    if vmax == vmin:
        # All models have the same non-zero value → all get 50
        for k in values_by_model:
            results[k] = 50.0 if k in nonzero_vals else 0.0
        return results

    for k, v in values_by_model.items():
        if k in zero_models:
            results[k] = 0.0
        else:
            # Scale to 10-100 range (reserve 0-10 for "no data" zone)
            score = 10.0 + 90.0 * (v - vmin) / (vmax - vmin)
            results[k] = round(max(0.0, min(100.0, score)), 2)

    return results
