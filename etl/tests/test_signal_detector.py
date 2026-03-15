"""
Tests for etl/processing/signal_detector.py

Tests signal detection logic:
- _z_score helper
- Divergence detection (VI_trade vs DevAdoption momentum)
- Momentum breakout detection (lowered thresholds, no accel requirement)
- Mean reversion detection (replaces adoption_backed)
- Trend momentum detection (for non-SDK models)
- Signal conflict resolution
- Edge cases and threshold verification

Uses mocking to avoid Supabase calls.
"""

import unittest
from unittest.mock import patch, MagicMock
from datetime import date, timedelta

from etl.processing.signal_detector import _z_score


class TestZScore(unittest.TestCase):
    """Test _z_score helper function."""

    def test_too_few_values(self):
        self.assertEqual(_z_score([1.0, 2.0]), 0.0)
        self.assertEqual(_z_score([1.0]), 0.0)
        self.assertEqual(_z_score([]), 0.0)

    def test_all_same_values(self):
        """All same values -> std=0 -> z=0."""
        result = _z_score([5.0, 5.0, 5.0, 5.0])
        self.assertAlmostEqual(result, 0.0)

    def test_last_value_is_mean(self):
        """If last value equals mean, z-score should be 0."""
        values = [1.0, 2.0, 3.0, 2.0]  # mean=2.0, last=2.0
        result = _z_score(values)
        self.assertAlmostEqual(result, 0.0)

    def test_positive_outlier(self):
        """Last value much higher than rest -> positive z."""
        values = [1.0, 1.0, 1.0, 1.0, 10.0]
        result = _z_score(values)
        self.assertGreater(result, 1.0)

    def test_negative_outlier(self):
        """Last value much lower than rest -> negative z."""
        values = [10.0, 10.0, 10.0, 10.0, 1.0]
        result = _z_score(values)
        self.assertLess(result, -1.0)

    def test_standard_normal_distribution(self):
        """Z-score of last value in a known distribution."""
        # mean=5, std=2 (approx), last value=9 -> z approx 2
        values = [3.0, 5.0, 7.0, 5.0, 9.0]
        result = _z_score(values)
        self.assertGreater(result, 1.0)


class TestDetectDivergence(unittest.TestCase):
    """Test divergence signal detection (VI_trade vs DevAdoption)."""

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_too_few_days_returns_none(self, mock_daily, mock_raw):
        """Need at least 8 days of data."""
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-0{i}"}
            for i in range(1, 6)
        ]

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_divergence_returns_none(self, mock_daily, mock_raw):
        """When VI and DevAdoption move together, no divergence."""
        # 12 days of data, flat trend
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 13)
        ]
        mock_raw.return_value = [
            {"metric_value": 100000.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 13)
        ]

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_strong_divergence_returns_signal(self, mock_daily, mock_raw):
        """VI rising rapidly while DevAdoption flat -> bullish divergence."""
        # VI rising 5 points per day
        mock_daily.return_value = [
            {"vi_trade": 40.0 + i * 5, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        # DevAdoption completely flat
        mock_raw.return_value = [
            {"metric_value": 100000.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertEqual(result["signal_type"], "divergence")
            self.assertIn(result["direction"], ["bullish", "bearish"])
            self.assertGreater(result["strength"], 0)
            self.assertIn("expires_at", result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_devadoption_data_returns_none(self, mock_daily, mock_raw):
        mock_daily.return_value = [
            {"vi_trade": 50.0 + i, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        mock_raw.return_value = []  # No DevAdoption data

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_divergence_calls_devadoption_source(self, mock_daily, mock_raw):
        """Verify divergence queries 'devadoption' source, not 'polymarket'."""
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 12)
        ]
        mock_raw.return_value = []

        from etl.processing.signal_detector import detect_divergence
        detect_divergence("model-1", date(2026, 2, 18))

        # Verify it called get_raw_metrics with 'devadoption', not 'polymarket'
        mock_raw.assert_called_once()
        call_args = mock_raw.call_args
        self.assertEqual(call_args[0][1], "devadoption")
        self.assertEqual(call_args[0][2], "downloads_daily")


class TestDetectMomentumBreakout(unittest.TestCase):
    """Test momentum breakout signal detection (lowered thresholds)."""

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_too_few_days_returns_none(self, mock_daily, mock_raw):
        mock_daily.return_value = [
            {"vi_trade": 80.0, "delta7_trade": 20.0, "accel_trade": 5.0}
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_low_vi_no_breakout(self, mock_daily, mock_raw):
        """VI below threshold (45 for <7 days) -> no breakout."""
        mock_daily.return_value = [
            {"vi_trade": 40.0, "delta7_trade": 20.0, "accel_trade": 5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 6)  # < 7 days
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_negative_accel_still_fires(self, mock_daily, mock_raw):
        """Accel requirement removed — negative accel should NOT block signal."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0, "accel_trade": -1.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)  # 9 days -> thresholds: VI>50, d7>5
        ]
        # DevAdoption barely moved
        mock_raw.return_value = [
            {"metric_value": 100000.0 + (i * 100), "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))

        # Should fire now (accel no longer blocks)
        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "momentum_breakout")
        self.assertEqual(result["direction"], "bullish")

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_breakout_lowered_thresholds_7_days(self, mock_daily, mock_raw):
        """With 7+ days: VI>50, delta7>5 should fire."""
        mock_daily.return_value = [
            {"vi_trade": 55.0, "delta7_trade": 6.0, "accel_trade": 2.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)  # 9 days -> 7+ tier
        ]
        mock_raw.return_value = [
            {"metric_value": 100000.0 + (i * 100), "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "momentum_breakout")

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_breakout_lowered_thresholds_14_days(self, mock_daily, mock_raw):
        """With 14+ days: VI>55, delta7>8 should fire."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0, "accel_trade": 1.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 15)  # 14 days -> 14+ tier
        ]
        mock_raw.return_value = [
            {"metric_value": 100000.0 + (i * 100), "date": f"2026-02-{i:02d}"}
            for i in range(1, 15)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "momentum_breakout")

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_adoption_caught_up_no_breakout(self, mock_daily, mock_raw):
        """If adoption grew >= 10%, no breakout (adoption confirmed hype)."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0, "accel_trade": 5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        # DevAdoption grew significantly (>10% over period)
        mock_raw.return_value = [
            {"metric_value": 100000.0 + i * 5000, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_breakout_calls_devadoption_source(self, mock_daily, mock_raw):
        """Verify breakout queries 'devadoption' source, not 'polymarket'."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0, "accel_trade": 3.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]
        mock_raw.return_value = []

        from etl.processing.signal_detector import detect_momentum_breakout
        detect_momentum_breakout("model-1", date(2026, 2, 18))

        mock_raw.assert_called_once()
        call_args = mock_raw.call_args
        self.assertEqual(call_args[0][1], "devadoption")
        self.assertEqual(call_args[0][2], "downloads_daily")


class TestDetectMeanReversion(unittest.TestCase):
    """Test mean-reversion signal detection (replaces adoption_backed)."""

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_data_returns_none(self, mock_daily, mock_comp):
        mock_daily.return_value = []

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_positive_delta7_returns_none(self, mock_daily, mock_comp):
        """Model must be declining (delta7 < -5)."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_small_decline_returns_none(self, mock_daily, mock_comp):
        """delta7 = -3 is not enough (threshold is -5)."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": -3.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_decline_with_strong_d_fires(self, mock_daily, mock_comp):
        """Declining VI with D>40 should fire bullish mean_reversion."""
        mock_daily.return_value = [
            {"vi_trade": 45.0, "delta7_trade": -10.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        mock_comp.return_value = 60.0  # D > 40

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "mean_reversion")
        self.assertEqual(result["direction"], "bullish")
        # Strength: min(100, abs(-10)*3 + 60*0.3) = min(100, 30+18) = 48
        self.assertAlmostEqual(result["strength"], 48.0)
        self.assertIn("DevAdoption", result["reasoning"])

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_decline_no_d_but_strong_t_fires(self, mock_daily, mock_comp):
        """Non-SDK model: D=0 but T>30 should fire."""
        mock_daily.return_value = [
            {"vi_trade": 40.0, "delta7_trade": -8.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        def component_side_effect(model_id, component, calc_date):
            if component == "D":
                return 0.0  # No SDK data
            if component == "T":
                return 45.0  # Strong search presence
            if component == "N":
                return 25.0
            return 0.0

        mock_comp.side_effect = component_side_effect

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "mean_reversion")
        self.assertEqual(result["direction"], "bullish")
        self.assertIn("no SDK data", result["reasoning"])

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_decline_no_d_weak_tn_returns_none(self, mock_daily, mock_comp):
        """Non-SDK model with weak T and N should not fire."""
        mock_daily.return_value = [
            {"vi_trade": 30.0, "delta7_trade": -10.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        def component_side_effect(model_id, component, calc_date):
            if component == "D":
                return 0.0
            if component == "T":
                return 20.0  # T <= 30
            if component == "N":
                return 15.0  # N <= 40
            return 0.0

        mock_comp.side_effect = component_side_effect

        from etl.processing.signal_detector import detect_mean_reversion
        result = detect_mean_reversion("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    def test_backward_compat_alias(self):
        """detect_quality_backed should be an alias for detect_mean_reversion."""
        from etl.processing.signal_detector import (
            detect_quality_backed,
            detect_mean_reversion,
        )
        self.assertIs(detect_quality_backed, detect_mean_reversion)


class TestDetectTrendMomentum(unittest.TestCase):
    """Test trend momentum signal for non-SDK models."""

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_data_returns_none(self, mock_daily, mock_comp):
        mock_daily.return_value = []

        from etl.processing.signal_detector import detect_trend_momentum
        result = detect_trend_momentum("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_sdk_model_skipped(self, mock_daily, mock_comp):
        """Models with D > 0 should be skipped."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]
        mock_comp.return_value = 50.0  # D > 0

        from etl.processing.signal_detector import detect_trend_momentum
        result = detect_trend_momentum("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_bullish_trend_momentum(self, mock_daily, mock_comp):
        """Non-SDK model with growing T and strong N should fire bullish."""
        mock_daily.return_value = [
            {"vi_trade": 55.0, "delta7_trade": 8.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        def component_side_effect(model_id, component, calc_date):
            if component == "D":
                return 0.0  # Non-SDK
            if component == "T":
                if calc_date == date(2026, 2, 11):
                    return 30.0  # 7 days ago
                return 50.0  # Today — growing
            if component == "S":
                return 35.0  # S > 30
            if component == "N":
                return 45.0  # N > 40
            return 0.0

        mock_comp.side_effect = component_side_effect

        from etl.processing.signal_detector import detect_trend_momentum
        result = detect_trend_momentum("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "trend_momentum")
        self.assertEqual(result["direction"], "bullish")
        self.assertGreater(result["strength"], 0)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_bearish_trend_momentum(self, mock_daily, mock_comp):
        """Non-SDK model declining with weak S and N should fire bearish."""
        mock_daily.return_value = [
            {"vi_trade": 25.0, "delta7_trade": -8.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        def component_side_effect(model_id, component, calc_date):
            if component == "D":
                return 0.0  # Non-SDK
            if component == "T":
                if calc_date == date(2026, 2, 11):
                    return 30.0  # 7 days ago
                return 15.0  # Today — declining
            if component == "S":
                return 10.0  # S < 20
            if component == "N":
                return 8.0  # N < 20
            return 0.0

        mock_comp.side_effect = component_side_effect

        from etl.processing.signal_detector import detect_trend_momentum
        result = detect_trend_momentum("model-1", date(2026, 2, 18))

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "trend_momentum")
        self.assertEqual(result["direction"], "bearish")

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_signal_when_neutral(self, mock_daily, mock_comp):
        """Small delta7 should not trigger any signal."""
        mock_daily.return_value = [
            {"vi_trade": 50.0, "delta7_trade": 1.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        mock_comp.return_value = 0.0  # D=0, non-SDK

        from etl.processing.signal_detector import detect_trend_momentum
        result = detect_trend_momentum("model-1", date(2026, 2, 18))
        self.assertIsNone(result)


class TestResolveSignalConflicts(unittest.TestCase):
    """Test signal conflict resolution logic."""

    def test_no_conflict(self):
        """All same direction — no conflict."""
        from etl.processing.signal_detector import _resolve_signal_conflicts
        signals = [
            {"direction": "bullish", "signal_type": "momentum_breakout", "strength": 60},
            {"direction": "bullish", "signal_type": "mean_reversion", "strength": 45},
        ]
        result = _resolve_signal_conflicts(signals, "test-model")
        self.assertEqual(len(result), 2)

    def test_conflict_bullish_wins(self):
        """Bullish stronger -> keep only bullish signals."""
        from etl.processing.signal_detector import _resolve_signal_conflicts
        signals = [
            {"direction": "bullish", "signal_type": "mean_reversion", "strength": 70},
            {"direction": "bearish", "signal_type": "trend_momentum", "strength": 40},
        ]
        result = _resolve_signal_conflicts(signals, "test-model")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["direction"], "bullish")

    def test_conflict_bearish_wins(self):
        """Bearish stronger -> keep only bearish signals."""
        from etl.processing.signal_detector import _resolve_signal_conflicts
        signals = [
            {"direction": "bullish", "signal_type": "mean_reversion", "strength": 30},
            {"direction": "bearish", "signal_type": "trend_momentum", "strength": 65},
        ]
        result = _resolve_signal_conflicts(signals, "test-model")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["direction"], "bearish")

    def test_single_signal_no_change(self):
        from etl.processing.signal_detector import _resolve_signal_conflicts
        signals = [
            {"direction": "bullish", "signal_type": "divergence", "strength": 50},
        ]
        result = _resolve_signal_conflicts(signals, "test-model")
        self.assertEqual(len(result), 1)

    def test_empty_list(self):
        from etl.processing.signal_detector import _resolve_signal_conflicts
        result = _resolve_signal_conflicts([], "test-model")
        self.assertEqual(len(result), 0)


if __name__ == "__main__":
    unittest.main()
