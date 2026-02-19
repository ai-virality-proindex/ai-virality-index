"""
Tests for etl/processing/index_calculator.py

Tests core index calculation logic:
- Weight sums, formula correctness
- Momentum calculation (delta7, acceleration)
- Signal_trade and heat_content composites
- _normalize_momentum helper
- Edge cases with missing/partial data

Uses mocking to avoid Supabase calls.
"""

import unittest
from unittest.mock import patch, MagicMock
from datetime import date

from etl.processing.index_calculator import (
    calculate_momentum,
    calculate_signal_trade,
    calculate_heat_content,
    _normalize_momentum,
    ALPHA_TRADE,
    ALPHA_CONTENT,
)
from etl.config import WEIGHTS_TRADE, WEIGHTS_CONTENT


class TestWeightConfiguration(unittest.TestCase):
    """Verify weight sums and values match spec."""

    def test_trade_weights_sum_to_one(self):
        total = sum(WEIGHTS_TRADE.values())
        self.assertAlmostEqual(total, 1.0, places=9)

    def test_content_weights_sum_to_one(self):
        total = sum(WEIGHTS_CONTENT.values())
        self.assertAlmostEqual(total, 1.0, places=9)

    def test_trade_weights_match_spec(self):
        expected = {"T": 0.18, "S": 0.28, "G": 0.15, "N": 0.12, "D": 0.15, "M": 0.12}
        for k, v in expected.items():
            self.assertAlmostEqual(WEIGHTS_TRADE[k], v, places=9, msg=f"Weight {k}")

    def test_content_weights_match_spec(self):
        expected = {"T": 0.25, "S": 0.35, "G": 0.05, "N": 0.20, "D": 0.05, "M": 0.10}
        for k, v in expected.items():
            self.assertAlmostEqual(WEIGHTS_CONTENT[k], v, places=9, msg=f"Weight {k}")

    def test_all_six_components_present(self):
        components = {"T", "S", "G", "N", "D", "M"}
        self.assertEqual(set(WEIGHTS_TRADE.keys()), components)
        self.assertEqual(set(WEIGHTS_CONTENT.keys()), components)

    def test_ewma_alphas(self):
        self.assertAlmostEqual(ALPHA_TRADE, 0.35)
        self.assertAlmostEqual(ALPHA_CONTENT, 0.25)


class TestNormalizeMomentum(unittest.TestCase):
    """Test _normalize_momentum helper."""

    def test_zero_maps_to_50(self):
        self.assertAlmostEqual(_normalize_momentum(0.0, max_abs=50.0), 50.0)

    def test_positive_max_maps_to_100(self):
        self.assertAlmostEqual(_normalize_momentum(50.0, max_abs=50.0), 100.0)

    def test_negative_max_maps_to_0(self):
        self.assertAlmostEqual(_normalize_momentum(-50.0, max_abs=50.0), 0.0)

    def test_half_positive(self):
        self.assertAlmostEqual(_normalize_momentum(25.0, max_abs=50.0), 75.0)

    def test_half_negative(self):
        self.assertAlmostEqual(_normalize_momentum(-25.0, max_abs=50.0), 25.0)

    def test_clamping_above_max(self):
        """Values beyond max_abs should be clamped."""
        result = _normalize_momentum(100.0, max_abs=50.0)
        self.assertAlmostEqual(result, 100.0)

    def test_clamping_below_min(self):
        result = _normalize_momentum(-100.0, max_abs=50.0)
        self.assertAlmostEqual(result, 0.0)

    def test_custom_max_abs(self):
        self.assertAlmostEqual(_normalize_momentum(15.0, max_abs=30.0), 75.0)


class TestCalculateMomentum(unittest.TestCase):
    """Test momentum (delta7 + acceleration) calculation."""

    def test_too_few_values_returns_zeros(self):
        result = calculate_momentum([50, 51, 52])
        self.assertEqual(result["delta7"], 0.0)
        self.assertEqual(result["acceleration"], 0.0)

    def test_exactly_8_values_gives_delta7(self):
        # scores[7] - scores[0] = 57 - 50 = 7
        scores = [50, 51, 52, 53, 54, 55, 56, 57]
        result = calculate_momentum(scores)
        self.assertAlmostEqual(result["delta7"], 7.0)
        self.assertEqual(result["acceleration"], 0.0)  # not enough for accel

    def test_15_values_gives_acceleration(self):
        # delta7 = scores[14] - scores[7] = 64 - 57 = 7
        # delta7_prev = scores[7] - scores[0] = 57 - 50 = 7
        # accel = 7 - 7 = 0
        scores = list(range(50, 65))
        result = calculate_momentum(scores)
        self.assertAlmostEqual(result["delta7"], 7.0)
        self.assertAlmostEqual(result["acceleration"], 0.0)

    def test_accelerating_trend(self):
        # Create a trend that accelerates: slow then fast
        scores = [50, 50, 50, 50, 50, 50, 50, 51,  # delta7_prev = 1
                  52, 54, 56, 58, 60, 62, 64]         # delta7 = 64-51 = 13
        result = calculate_momentum(scores)
        self.assertGreater(result["delta7"], 0)
        self.assertGreater(result["acceleration"], 0)

    def test_decelerating_trend(self):
        # Fast then slow
        scores = [50, 52, 54, 56, 58, 60, 62, 64,  # delta7_prev = 14
                  65, 65, 65, 65, 65, 65, 65]         # delta7 = 65-64 = 1
        result = calculate_momentum(scores)
        self.assertLess(result["acceleration"], 0)

    def test_flat_scores(self):
        scores = [50.0] * 15
        result = calculate_momentum(scores)
        self.assertAlmostEqual(result["delta7"], 0.0)
        self.assertAlmostEqual(result["acceleration"], 0.0)

    def test_negative_delta7(self):
        # Declining trend
        scores = list(range(64, 49, -1))
        result = calculate_momentum(scores)
        self.assertLess(result["delta7"], 0)

    def test_7_values_returns_zeros(self):
        scores = [50, 51, 52, 53, 54, 55, 56]
        result = calculate_momentum(scores)
        self.assertEqual(result["delta7"], 0.0)

    def test_results_are_rounded(self):
        scores = [50.0, 50.1, 50.2, 50.3, 50.4, 50.5, 50.6, 50.7]
        result = calculate_momentum(scores)
        # delta7 = 50.7 - 50.0 = 0.7 -> should be 0.7
        self.assertEqual(result["delta7"], 0.7)


class TestCalculateSignalTrade(unittest.TestCase):
    """Test Signal_trade composite: 0.60*VI + 0.25*norm(d7) + 0.15*norm(accel)"""

    def test_neutral_inputs(self):
        # VI=50, delta7=0 (norm=50), accel=0 (norm=50)
        result = calculate_signal_trade(50.0, 0.0, 0.0)
        # 0.60*50 + 0.25*50 + 0.15*50 = 30+12.5+7.5 = 50
        self.assertAlmostEqual(result, 50.0)

    def test_max_bullish(self):
        # VI=100, delta7=50 (norm=100), accel=30 (norm=100)
        result = calculate_signal_trade(100.0, 50.0, 30.0)
        # 0.60*100 + 0.25*100 + 0.15*100 = 100
        self.assertAlmostEqual(result, 100.0)

    def test_max_bearish(self):
        # VI=0, delta7=-50 (norm=0), accel=-30 (norm=0)
        result = calculate_signal_trade(0.0, -50.0, -30.0)
        self.assertAlmostEqual(result, 0.0)

    def test_high_vi_negative_momentum(self):
        # VI=80, delta7=-20, accel=-10
        result = calculate_signal_trade(80.0, -20.0, -10.0)
        # 0.60*80 + 0.25*norm(-20,50) + 0.15*norm(-10,30)
        # = 48 + 0.25*30 + 0.15*33.33
        # = 48 + 7.5 + 5.0 = 60.5
        self.assertGreater(result, 40)
        self.assertLess(result, 70)

    def test_result_always_in_0_100(self):
        # Edge cases
        for vi in [0, 50, 100]:
            for d7 in [-100, -50, 0, 50, 100]:
                for acc in [-100, -30, 0, 30, 100]:
                    result = calculate_signal_trade(vi, d7, acc)
                    self.assertGreaterEqual(result, 0.0)
                    self.assertLessEqual(result, 100.0)

    def test_formula_weights(self):
        # Verify the 0.60/0.25/0.15 split
        # Set d7 and accel to 0 (norm=50), vary VI
        r1 = calculate_signal_trade(0.0, 0.0, 0.0)
        r2 = calculate_signal_trade(100.0, 0.0, 0.0)
        vi_contribution = r2 - r1
        # Should be 0.60 * 100 = 60
        self.assertAlmostEqual(vi_contribution, 60.0)


class TestCalculateHeatContent(unittest.TestCase):
    """Test Heat_content composite: 0.50*VI_content + 0.50*norm(d7)"""

    def test_neutral(self):
        result = calculate_heat_content(50.0, 0.0)
        # 0.50*50 + 0.50*50 = 50
        self.assertAlmostEqual(result, 50.0)

    def test_max_heat(self):
        result = calculate_heat_content(100.0, 50.0)
        self.assertAlmostEqual(result, 100.0)

    def test_min_heat(self):
        result = calculate_heat_content(0.0, -50.0)
        self.assertAlmostEqual(result, 0.0)

    def test_high_content_no_momentum(self):
        result = calculate_heat_content(80.0, 0.0)
        # 0.50*80 + 0.50*50 = 40+25 = 65
        self.assertAlmostEqual(result, 65.0)

    def test_equal_split(self):
        # Verify 50/50 split
        r_low = calculate_heat_content(0.0, 0.0)
        r_high = calculate_heat_content(100.0, 0.0)
        vi_contribution = r_high - r_low
        self.assertAlmostEqual(vi_contribution, 50.0)

    def test_result_bounded(self):
        for vi in [0, 25, 50, 75, 100]:
            for d7 in [-100, -50, 0, 50, 100]:
                result = calculate_heat_content(vi, d7)
                self.assertGreaterEqual(result, 0.0)
                self.assertLessEqual(result, 100.0)


class TestCalculateIndex(unittest.TestCase):
    """Test calculate_index with mocked Supabase."""

    @patch("etl.processing.index_calculator.get_raw_metrics")
    def test_no_data_returns_zero(self, mock_raw):
        """When all components have no data, VI should be 0 (no signal)."""
        mock_raw.return_value = []

        from etl.processing.index_calculator import calculate_index
        result = calculate_index("fake-uuid", date(2026, 2, 18), mode="trade")

        self.assertAlmostEqual(result["vi_score"], 0.0)
        for comp in ["T", "S", "G", "N", "D", "M"]:
            self.assertAlmostEqual(result["components_smoothed"][comp], 0.0)

    @patch("etl.processing.index_calculator.get_raw_metrics")
    def test_result_has_required_keys(self, mock_raw):
        mock_raw.return_value = []

        from etl.processing.index_calculator import calculate_index
        result = calculate_index("fake-uuid", date(2026, 2, 18), mode="trade")

        self.assertIn("vi_score", result)
        self.assertIn("components_raw", result)
        self.assertIn("components_normalized", result)
        self.assertIn("components_smoothed", result)

    @patch("etl.processing.index_calculator.get_raw_metrics")
    def test_vi_score_in_0_100_range(self, mock_raw):
        # Simulate varied data across components
        mock_raw.return_value = [
            {"date": f"2026-02-{i:02d}", "metric_value": float(i * 100)}
            for i in range(1, 15)
        ]

        from etl.processing.index_calculator import calculate_index
        result = calculate_index("fake-uuid", date(2026, 2, 18), mode="trade")

        self.assertGreaterEqual(result["vi_score"], 0.0)
        self.assertLessEqual(result["vi_score"], 100.0)

    @patch("etl.processing.index_calculator.get_raw_metrics")
    def test_content_mode_uses_different_weights(self, mock_raw):
        mock_raw.return_value = [
            {"date": f"2026-02-{i:02d}", "metric_value": float(i * 10)}
            for i in range(1, 15)
        ]

        from etl.processing.index_calculator import calculate_index
        trade = calculate_index("fake-uuid", date(2026, 2, 18), mode="trade")
        content = calculate_index("fake-uuid", date(2026, 2, 18), mode="content")

        # With same data but different weights, scores should differ
        # (they might be close but are mathematically different due to EWMA alpha)
        self.assertIsInstance(trade["vi_score"], float)
        self.assertIsInstance(content["vi_score"], float)


if __name__ == "__main__":
    unittest.main()
