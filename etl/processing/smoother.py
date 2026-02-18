"""
Smoother module for AI Virality Index.

Implements EWMA (Exponential Weighted Moving Average) and simple moving average.
Used to smooth normalized scores before index calculation.

Spec reference: TECHNICAL_SPEC.md section 2.5
  - Trading mode: alpha=0.35 (faster response)
  - Content mode: alpha=0.25 (smoother)
  - Public chart: 7-day moving average
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)


def ewma(
    values: list[float],
    alpha: float = 0.35,
) -> list[float]:
    """
    Compute Exponential Weighted Moving Average.

    Formula: EWMA(t) = alpha * x(t) + (1 - alpha) * EWMA(t-1)

    Args:
        values: Time series values (ordered by date ascending).
        alpha: Smoothing factor in (0, 1]. Higher = faster response.
               Trading: 0.35, Content: 0.25.

    Returns:
        List of smoothed values (same length as input).
        Empty list if input is empty.
    """
    if not values:
        return []

    if not (0 < alpha <= 1):
        raise ValueError(f"alpha must be in (0, 1], got {alpha}")

    result = [float(values[0])]
    for i in range(1, len(values)):
        v = float(values[i])
        if np.isfinite(v):
            smoothed = alpha * v + (1 - alpha) * result[-1]
        else:
            # Skip NaN/inf — carry forward previous value
            smoothed = result[-1]
        result.append(round(smoothed, 4))

    return result


def moving_average(
    values: list[float],
    window: int = 7,
) -> list[float]:
    """
    Compute simple moving average.

    For positions with fewer than `window` prior values,
    uses all available values (expanding window).

    Args:
        values: Time series values (ordered by date ascending).
        window: Window size (default 7 for weekly average).

    Returns:
        List of smoothed values (same length as input).
        Empty list if input is empty.
    """
    if not values:
        return []

    if window < 1:
        raise ValueError(f"window must be >= 1, got {window}")

    arr = np.array(values, dtype=np.float64)
    result = []

    for i in range(len(arr)):
        start = max(0, i - window + 1)
        window_slice = arr[start:i + 1]
        # Filter out NaN/inf
        valid = window_slice[np.isfinite(window_slice)]
        if len(valid) > 0:
            result.append(round(float(np.mean(valid)), 4))
        else:
            result.append(0.0)

    return result


def ewma_single(
    previous_ewma: float,
    current_value: float,
    alpha: float = 0.35,
) -> float:
    """
    Compute a single EWMA step (for incremental updates).

    Args:
        previous_ewma: The EWMA value from the previous period.
        current_value: The new raw value.
        alpha: Smoothing factor.

    Returns:
        New EWMA value.
    """
    if not np.isfinite(current_value):
        return previous_ewma
    return round(alpha * current_value + (1 - alpha) * previous_ewma, 4)
