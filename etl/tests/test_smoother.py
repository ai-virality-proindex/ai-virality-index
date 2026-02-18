"""Tests for etl/processing/smoother.py"""

import pytest
from etl.processing.smoother import ewma, moving_average, ewma_single
import math


class TestEWMA:
    """Tests for the EWMA function."""

    def test_basic_ewma(self):
        """Basic EWMA computation."""
        values = [10, 20, 30, 40, 50]
        result = ewma(values, alpha=0.5)
        assert len(result) == 5
        # First value unchanged
        assert result[0] == 10.0
        # EWMA(1) = 0.5*20 + 0.5*10 = 15
        assert result[1] == 15.0
        # EWMA(2) = 0.5*30 + 0.5*15 = 22.5
        assert result[2] == 22.5
        # EWMA(3) = 0.5*40 + 0.5*22.5 = 31.25
        assert result[3] == 31.25

    def test_ewma_alpha_035_faster_than_025(self):
        """Alpha=0.35 (trading) should react faster than alpha=0.25 (content)."""
        # Scenario: stable at 50, then sudden jump to 100
        values = [50] * 20 + [100] * 5
        result_fast = ewma(values, alpha=0.35)
        result_slow = ewma(values, alpha=0.25)

        # After the jump, faster alpha should be closer to 100
        for i in range(21, 25):
            assert result_fast[i] > result_slow[i], \
                f"At index {i}: fast={result_fast[i]} should > slow={result_slow[i]}"

    def test_ewma_alpha_1_equals_input(self):
        """Alpha=1 should return the original values (no smoothing)."""
        values = [10, 50, 20, 80, 30]
        result = ewma(values, alpha=1.0)
        for orig, smoothed in zip(values, result):
            assert smoothed == orig

    def test_ewma_low_alpha_very_smooth(self):
        """Very low alpha should produce very smooth output."""
        values = [100, 0, 100, 0, 100, 0, 100, 0]
        result = ewma(values, alpha=0.1)
        # With alpha=0.1, values change slowly
        # The range of output should be much less than input range
        output_range = max(result) - min(result)
        assert output_range < 80  # much less than the 100 input range

    def test_ewma_empty_input(self):
        """Empty input returns empty output."""
        assert ewma([]) == []

    def test_ewma_single_value(self):
        """Single value returns single value."""
        result = ewma([42.0])
        assert result == [42.0]

    def test_ewma_invalid_alpha(self):
        """Alpha outside (0, 1] should raise ValueError."""
        with pytest.raises(ValueError):
            ewma([1, 2, 3], alpha=0)
        with pytest.raises(ValueError):
            ewma([1, 2, 3], alpha=-0.5)
        with pytest.raises(ValueError):
            ewma([1, 2, 3], alpha=1.5)

    def test_ewma_handles_nan(self):
        """NaN values should be skipped (carry forward)."""
        values = [10, 20, float('nan'), 40, 50]
        result = ewma(values, alpha=0.5)
        assert len(result) == 5
        # At NaN position, carry forward previous EWMA
        assert result[2] == result[1]
        # After NaN, continue normally
        assert result[3] == pytest.approx(0.5 * 40 + 0.5 * result[2], rel=1e-3)

    def test_ewma_handles_inf(self):
        """Inf values should be skipped (carry forward)."""
        values = [10, 20, float('inf'), 40]
        result = ewma(values, alpha=0.5)
        assert result[2] == result[1]  # inf skipped

    def test_ewma_preserves_length(self):
        """Output should always be same length as input."""
        for n in [1, 5, 50, 100]:
            values = list(range(n))
            result = ewma(values, alpha=0.35)
            assert len(result) == n

    def test_ewma_convergence(self):
        """EWMA on constant values should stay constant."""
        values = [75.0] * 20
        result = ewma(values, alpha=0.35)
        for v in result:
            assert v == pytest.approx(75.0, rel=1e-6)


class TestMovingAverage:
    """Tests for the moving_average function."""

    def test_basic_moving_average(self):
        """Basic 3-day moving average."""
        values = [10, 20, 30, 40, 50]
        result = moving_average(values, window=3)
        assert len(result) == 5
        # First value: just [10] -> 10
        assert result[0] == 10.0
        # Second: [10, 20] -> 15
        assert result[1] == 15.0
        # Third: [10, 20, 30] -> 20
        assert result[2] == 20.0
        # Fourth: [20, 30, 40] -> 30
        assert result[3] == 30.0
        # Fifth: [30, 40, 50] -> 40
        assert result[4] == 40.0

    def test_7day_moving_average(self):
        """Default 7-day window."""
        values = list(range(1, 15))  # 1 to 14
        result = moving_average(values, window=7)
        assert len(result) == 14
        # Last value: mean of [8,9,10,11,12,13,14] = 11
        assert result[-1] == 11.0

    def test_moving_average_empty(self):
        """Empty input returns empty output."""
        assert moving_average([]) == []

    def test_moving_average_single_value(self):
        """Single value returns that value."""
        result = moving_average([42.0], window=7)
        assert result == [42.0]

    def test_moving_average_window_1(self):
        """Window of 1 returns original values."""
        values = [10, 50, 20, 80]
        result = moving_average(values, window=1)
        for orig, avg in zip(values, result):
            assert avg == orig

    def test_moving_average_invalid_window(self):
        """Window < 1 should raise ValueError."""
        with pytest.raises(ValueError):
            moving_average([1, 2, 3], window=0)

    def test_moving_average_handles_nan(self):
        """NaN values should be excluded from average."""
        values = [10, 20, float('nan'), 40, 50]
        result = moving_average(values, window=3)
        # Index 2: window is [10, 20, NaN] -> average of [10, 20] = 15
        assert result[2] == 15.0
        # Index 3: window is [20, NaN, 40] -> average of [20, 40] = 30
        assert result[3] == 30.0

    def test_moving_average_preserves_length(self):
        """Output should always be same length as input."""
        for n in [1, 5, 50, 100]:
            values = list(range(n))
            result = moving_average(values, window=7)
            assert len(result) == n

    def test_moving_average_expanding_start(self):
        """First few values use expanding window."""
        values = [10, 20, 30, 40, 50]
        result = moving_average(values, window=10)
        # All 5 values < window, so each uses all available from start
        assert result[0] == 10.0       # [10]
        assert result[1] == 15.0       # [10, 20]
        assert result[2] == 20.0       # [10, 20, 30]
        assert result[3] == 25.0       # [10, 20, 30, 40]
        assert result[4] == 30.0       # [10, 20, 30, 40, 50]


class TestEWMASingle:
    """Tests for single-step EWMA."""

    def test_basic_step(self):
        """Basic single EWMA step."""
        result = ewma_single(50.0, 100.0, alpha=0.5)
        assert result == 75.0

    def test_nan_input(self):
        """NaN current value should return previous EWMA."""
        result = ewma_single(50.0, float('nan'), alpha=0.5)
        assert result == 50.0

    def test_inf_input(self):
        """Inf current value should return previous EWMA."""
        result = ewma_single(50.0, float('inf'), alpha=0.5)
        assert result == 50.0

    def test_matches_full_ewma(self):
        """Single step should match the last value from full EWMA."""
        values = [10, 20, 30, 40, 50]
        full = ewma(values, alpha=0.35)

        # Compute step-by-step using ewma_single
        prev = float(values[0])
        for i in range(1, len(values)):
            prev = ewma_single(prev, values[i], alpha=0.35)

        assert prev == pytest.approx(full[-1], rel=1e-4)
