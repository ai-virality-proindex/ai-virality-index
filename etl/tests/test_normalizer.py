"""Tests for etl/processing/normalizer.py"""

import pytest
from etl.processing.normalizer import quantile_normalize, normalize_batch, _minmax_normalize
import numpy as np


class TestQuantileNormalize:
    """Tests for the quantile_normalize function."""

    def test_basic_normalization(self):
        """Middle value in a uniform range should normalize near 50."""
        values = list(range(1, 101))  # 1 to 100
        score = quantile_normalize(values)
        # Last value is 100, which is at q95 or above -> should be ~100
        assert 95 <= score <= 100

    def test_minimum_value(self):
        """Value at the bottom of distribution should normalize near 0."""
        values = list(range(1, 101))
        score = quantile_normalize(values, current_value=1)
        assert score <= 5

    def test_median_value(self):
        """Median value should normalize around 50."""
        values = list(range(1, 101))
        score = quantile_normalize(values, current_value=50)
        # q05=5.95, q95=95.05 -> (50-5.95)/(95.05-5.95) * 100 ≈ 49.4
        assert 40 <= score <= 60

    def test_outlier_resistance(self):
        """A 10x outlier should not break the scale (gets clipped to q95)."""
        normal_values = list(range(10, 60))  # 10-59
        outlier_value = 500  # 10x normal max
        values = normal_values + [outlier_value]
        score = quantile_normalize(values, current_value=outlier_value)
        # Should be clipped to q95, so score = 100 (not infinity)
        assert score == 100.0

    def test_outlier_doesnt_corrupt_others(self):
        """Adding an outlier shouldn't dramatically shift scores for normal values."""
        normal_values = list(range(10, 60))
        score_before = quantile_normalize(normal_values, current_value=35)

        values_with_outlier = normal_values + [500]
        score_after = quantile_normalize(values_with_outlier, current_value=35)

        # Score should stay relatively close (quantile is robust)
        assert abs(score_before - score_after) < 15

    def test_all_same_values(self):
        """All identical values should return 50."""
        values = [42.0] * 30
        score = quantile_normalize(values)
        assert score == 50.0

    def test_empty_values(self):
        """Empty input should return 50."""
        score = quantile_normalize([])
        assert score == 50.0

    def test_single_value(self):
        """Single value (< 7 days) uses min-max fallback -> 50 (all same)."""
        score = quantile_normalize([42.0])
        assert score == 50.0

    def test_short_history_minmax_fallback(self):
        """Less than 7 values should use min-max normalization."""
        values = [10, 20, 30, 40, 50]  # 5 values < 7
        score = quantile_normalize(values, current_value=30)
        # min-max: (30-10)/(50-10) * 100 = 50.0
        assert score == 50.0

    def test_window_parameter(self):
        """Window parameter should limit the lookback."""
        old_values = [100.0] * 50
        new_values = [10.0] * 30
        all_values = old_values + new_values

        # With window=30, only new_values matter (all ~10)
        score = quantile_normalize(all_values, current_value=10.0, window=30)
        assert score == 50.0  # all same within window

    def test_result_bounds(self):
        """Result should always be in [0, 100]."""
        for _ in range(20):
            values = list(np.random.uniform(0, 1000, size=100))
            current = np.random.uniform(-100, 2000)
            score = quantile_normalize(values, current_value=current)
            assert 0 <= score <= 100

    def test_nan_inf_handling(self):
        """NaN and inf values in history should be filtered out."""
        values = [10, 20, float('nan'), 30, float('inf'), 40, 50, 60, 70, 80]
        score = quantile_normalize(values, current_value=45)
        # Should compute without error
        assert 0 <= score <= 100

    def test_current_value_none_uses_last(self):
        """When current_value is None, should use the last element."""
        values = list(range(1, 51))
        score_explicit = quantile_normalize(values, current_value=50)
        score_implicit = quantile_normalize(values)
        assert score_explicit == score_implicit

    def test_custom_quantiles(self):
        """Custom q_low/q_high should work."""
        values = list(range(1, 101))
        # Wider range (q01, q99) -> less clipping
        score = quantile_normalize(values, current_value=99, q_low=0.01, q_high=0.99)
        assert score > 95


class TestMinMaxNormalize:
    """Tests for the _minmax_normalize fallback."""

    def test_basic_minmax(self):
        """Basic min-max normalization."""
        arr = np.array([0, 50, 100])
        assert _minmax_normalize(arr, 50) == 50.0
        assert _minmax_normalize(arr, 0) == 0.0
        assert _minmax_normalize(arr, 100) == 100.0

    def test_minmax_all_same(self):
        """All same values returns 50."""
        arr = np.array([5, 5, 5])
        assert _minmax_normalize(arr, 5) == 50.0

    def test_minmax_clips_outlier(self):
        """Values outside range get clipped."""
        arr = np.array([10, 20, 30])
        # Value 50 > max(30), clips to 30 -> (30-10)/(30-10)*100 = 100
        assert _minmax_normalize(arr, 50) == 100.0
        # Value 0 < min(10), clips to 10 -> (10-10)/(30-10)*100 = 0
        assert _minmax_normalize(arr, 0) == 0.0


class TestNormalizeBatch:
    """Tests for batch normalization."""

    def test_batch_multiple_models(self):
        """Batch normalize multiple models."""
        data = {
            "chatgpt": list(range(50, 150)),
            "gemini": list(range(10, 60)),
            "claude": [],
        }
        results = normalize_batch(data)
        assert len(results) == 3
        assert 0 <= results["chatgpt"] <= 100
        assert 0 <= results["gemini"] <= 100
        assert results["claude"] == 50.0  # empty -> default
