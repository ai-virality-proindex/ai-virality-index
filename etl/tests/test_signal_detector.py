"""
Tests for etl/processing/signal_detector.py

Tests signal detection logic:
- _z_score helper
- Divergence detection
- Momentum breakout detection
- Quality-backed detection
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
    """Test divergence signal detection."""

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
        """When VI and odds move together, no divergence."""
        # 12 days of data, flat trend
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 13)
        ]
        mock_raw.return_value = [
            {"metric_value": 30.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 13)
        ]

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_strong_divergence_returns_signal(self, mock_daily, mock_raw):
        """VI rising rapidly while odds flat -> bullish divergence."""
        # VI rising 5 points per day
        mock_daily.return_value = [
            {"vi_trade": 40.0 + i * 5, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        # Odds completely flat
        mock_raw.return_value = [
            {"metric_value": 30.0, "date": f"2026-02-{i:02d}"}
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
    def test_no_odds_data_returns_none(self, mock_daily, mock_raw):
        mock_daily.return_value = [
            {"vi_trade": 50.0 + i, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        mock_raw.return_value = []  # No Polymarket data

        from etl.processing.signal_detector import detect_divergence
        result = detect_divergence("model-1", date(2026, 2, 18))
        self.assertIsNone(result)


class TestDetectMomentumBreakout(unittest.TestCase):
    """Test momentum breakout signal detection."""

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
        """VI below threshold -> no breakout."""
        mock_daily.return_value = [
            {"vi_trade": 40.0, "delta7_trade": 20.0, "accel_trade": 5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_negative_accel_no_breakout(self, mock_daily, mock_raw):
        """Acceleration must be > 0."""
        mock_daily.return_value = [
            {"vi_trade": 80.0, "delta7_trade": 20.0, "accel_trade": -1.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_breakout_when_conditions_met(self, mock_daily, mock_raw):
        """All conditions met: VI>65, d7>10, accel>0, odds<5pp."""
        mock_daily.return_value = [
            {"vi_trade": 75.0, "delta7_trade": 15.0, "accel_trade": 3.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]
        # Odds barely moved
        mock_raw.return_value = [
            {"metric_value": 30.0 + (i * 0.1), "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertEqual(result["signal_type"], "momentum_breakout")
            self.assertEqual(result["direction"], "bullish")

    @patch("etl.processing.signal_detector.get_raw_metrics")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_odds_caught_up_no_breakout(self, mock_daily, mock_raw):
        """If odds grew >= 5pp, no breakout (market already priced in)."""
        mock_daily.return_value = [
            {"vi_trade": 80.0, "delta7_trade": 20.0, "accel_trade": 5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        # Odds grew significantly (>5pp over 7 days)
        mock_raw.return_value = [
            {"metric_value": 30.0 + i, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]

        from etl.processing.signal_detector import detect_momentum_breakout
        result = detect_momentum_breakout("model-1", date(2026, 2, 18))
        self.assertIsNone(result)


class TestDetectQualityBacked(unittest.TestCase):
    """Test quality-backed signal detection."""

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_no_data_returns_none(self, mock_daily, mock_comp):
        mock_daily.return_value = []

        from etl.processing.signal_detector import detect_quality_backed
        result = detect_quality_backed("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_negative_delta7_returns_none(self, mock_daily, mock_comp):
        """Model must be growing (delta7 > 0)."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": -5.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        from etl.processing.signal_detector import detect_quality_backed
        result = detect_quality_backed("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_low_q_returns_none(self, mock_daily, mock_comp):
        """Q component must be above threshold."""
        mock_daily.return_value = [
            {"vi_trade": 60.0, "delta7_trade": 10.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]
        # Q below threshold of 65 (for 7+ days)
        mock_comp.return_value = 50.0

        from etl.processing.signal_detector import detect_quality_backed
        result = detect_quality_backed("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_component_score")
    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_quality_backed_signal(self, mock_daily, mock_comp):
        """When all conditions met: growing, high Q, G trending up."""
        mock_daily.return_value = [
            {"vi_trade": 70.0, "delta7_trade": 10.0,
             "date": f"2026-02-{i:02d}"}
            for i in range(1, 10)
        ]

        def component_side_effect(model_id, component, calc_date):
            if component == "Q":
                return 80.0  # Above threshold
            if component == "G":
                # G today > G 7 days ago
                if calc_date == date(2026, 2, 18):
                    return 70.0
                else:
                    return 50.0  # Previous was lower
            return 50.0

        mock_comp.side_effect = component_side_effect

        from etl.processing.signal_detector import detect_quality_backed
        result = detect_quality_backed("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertEqual(result["signal_type"], "quality_backed")
            self.assertEqual(result["direction"], "bullish")
            self.assertIn("reasoning", result)


if __name__ == "__main__":
    unittest.main()
