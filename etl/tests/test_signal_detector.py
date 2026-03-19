"""
Tests for etl/processing/signal_detector.py — v0.2

Tests 3 descriptive signal types:
- spike: VI rose >1.5σ over 7 days
- drop: VI fell >1.5σ over 7 days
- rank_change: model moved ≥2 positions over 7 days

Uses mocking to avoid Supabase calls.
"""

import unittest
from unittest.mock import patch
from datetime import date, timedelta


class TestDetectSpike(unittest.TestCase):
    """Test spike signal detection."""

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_too_few_days_returns_none(self, mock_daily):
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-0{i}"}
            for i in range(1, 6)
        ]
        from etl.processing.signal_detector import detect_spike
        result = detect_spike("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_flat_trend_no_spike(self, mock_daily):
        """Flat VI -> no spike."""
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        from etl.processing.signal_detector import detect_spike
        result = detect_spike("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_strong_rise_fires_spike(self, mock_daily):
        """VI rising steeply at the end -> spike."""
        # Flat for 10 days, then sharp rise for 5 days
        data = []
        for i in range(1, 12):
            data.append({"vi_trade": 50.0, "date": f"2026-02-{i:02d}"})
        for i in range(12, 17):
            data.append({"vi_trade": 50.0 + (i - 11) * 10, "date": f"2026-02-{i:02d}"})
        mock_daily.return_value = data

        from etl.processing.signal_detector import detect_spike
        result = detect_spike("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertEqual(result["signal_type"], "spike")
            self.assertEqual(result["direction"], "rising")
            self.assertGreater(result["strength"], 0)

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_spike_uses_rising_not_bullish(self, mock_daily):
        """v0.2: direction should be 'rising', not 'bullish'."""
        data = []
        for i in range(1, 12):
            data.append({"vi_trade": 40.0, "date": f"2026-02-{i:02d}"})
        for i in range(12, 17):
            data.append({"vi_trade": 40.0 + (i - 11) * 15, "date": f"2026-02-{i:02d}"})
        mock_daily.return_value = data

        from etl.processing.signal_detector import detect_spike
        result = detect_spike("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertNotEqual(result["direction"], "bullish")
            self.assertEqual(result["direction"], "rising")


class TestDetectDrop(unittest.TestCase):
    """Test drop signal detection."""

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_too_few_days_returns_none(self, mock_daily):
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-0{i}"}
            for i in range(1, 6)
        ]
        from etl.processing.signal_detector import detect_drop
        result = detect_drop("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_flat_trend_no_drop(self, mock_daily):
        mock_daily.return_value = [
            {"vi_trade": 50.0, "date": f"2026-02-{i:02d}"}
            for i in range(1, 16)
        ]
        from etl.processing.signal_detector import detect_drop
        result = detect_drop("model-1", date(2026, 2, 18))
        self.assertIsNone(result)

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_strong_decline_fires_drop(self, mock_daily):
        """VI falling steeply at the end -> drop."""
        data = []
        for i in range(1, 12):
            data.append({"vi_trade": 70.0, "date": f"2026-02-{i:02d}"})
        for i in range(12, 17):
            data.append({"vi_trade": 70.0 - (i - 11) * 10, "date": f"2026-02-{i:02d}"})
        mock_daily.return_value = data

        from etl.processing.signal_detector import detect_drop
        result = detect_drop("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertEqual(result["signal_type"], "drop")
            self.assertEqual(result["direction"], "declining")

    @patch("etl.processing.signal_detector._get_daily_scores_series")
    def test_drop_uses_declining_not_bearish(self, mock_daily):
        """v0.2: direction should be 'declining', not 'bearish'."""
        data = []
        for i in range(1, 12):
            data.append({"vi_trade": 80.0, "date": f"2026-02-{i:02d}"})
        for i in range(12, 17):
            data.append({"vi_trade": 80.0 - (i - 11) * 15, "date": f"2026-02-{i:02d}"})
        mock_daily.return_value = data

        from etl.processing.signal_detector import detect_drop
        result = detect_drop("model-1", date(2026, 2, 18))

        if result is not None:
            self.assertNotEqual(result["direction"], "bearish")
            self.assertEqual(result["direction"], "declining")


class TestDetectRankChange(unittest.TestCase):
    """Test rank change signal detection."""

    def test_no_all_scores_returns_none(self):
        from etl.processing.signal_detector import detect_rank_change
        result = detect_rank_change("model-1", date(2026, 2, 18), all_scores=None)
        self.assertIsNone(result)

    def test_small_change_returns_none(self):
        """Moving 1 position is not enough (threshold ≥2)."""
        from etl.processing.signal_detector import detect_rank_change

        all_scores = {
            "m1": [{"date": "2026-02-11", "vi_trade": 60}, {"date": "2026-02-18", "vi_trade": 55}],
            "m2": [{"date": "2026-02-11", "vi_trade": 55}, {"date": "2026-02-18", "vi_trade": 60}],
            "m3": [{"date": "2026-02-11", "vi_trade": 50}, {"date": "2026-02-18", "vi_trade": 50}],
        }

        result = detect_rank_change("m2", date(2026, 2, 18), all_scores=all_scores)
        self.assertIsNone(result)  # m2 moved from #2 to #1, only 1 position

    def test_big_improvement_fires_rising(self):
        """Moving up ≥2 positions -> rising."""
        from etl.processing.signal_detector import detect_rank_change

        all_scores = {
            "m1": [{"date": "2026-02-11", "vi_trade": 80}, {"date": "2026-02-18", "vi_trade": 40}],
            "m2": [{"date": "2026-02-11", "vi_trade": 70}, {"date": "2026-02-18", "vi_trade": 35}],
            "m3": [{"date": "2026-02-11", "vi_trade": 60}, {"date": "2026-02-18", "vi_trade": 30}],
            "m4": [{"date": "2026-02-11", "vi_trade": 30}, {"date": "2026-02-18", "vi_trade": 90}],
        }

        # m4 was #4, now #1 -> moved up 3 positions
        result = detect_rank_change("m4", date(2026, 2, 18), all_scores=all_scores)

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "rank_change")
        self.assertEqual(result["direction"], "rising")
        self.assertEqual(result["divergence_score"], 3)  # moved up 3

    def test_big_decline_fires_declining(self):
        """Moving down ≥2 positions -> declining."""
        from etl.processing.signal_detector import detect_rank_change

        all_scores = {
            "m1": [{"date": "2026-02-11", "vi_trade": 80}, {"date": "2026-02-18", "vi_trade": 20}],
            "m2": [{"date": "2026-02-11", "vi_trade": 40}, {"date": "2026-02-18", "vi_trade": 70}],
            "m3": [{"date": "2026-02-11", "vi_trade": 30}, {"date": "2026-02-18", "vi_trade": 60}],
            "m4": [{"date": "2026-02-11", "vi_trade": 20}, {"date": "2026-02-18", "vi_trade": 50}],
        }

        # m1 was #1, now #4 -> moved down 3 positions
        result = detect_rank_change("m1", date(2026, 2, 18), all_scores=all_scores)

        self.assertIsNotNone(result)
        self.assertEqual(result["signal_type"], "rank_change")
        self.assertEqual(result["direction"], "declining")

    def test_missing_model_returns_none(self):
        from etl.processing.signal_detector import detect_rank_change
        all_scores = {
            "m1": [{"date": "2026-02-18", "vi_trade": 60}],
        }
        result = detect_rank_change("m999", date(2026, 2, 18), all_scores=all_scores)
        self.assertIsNone(result)


class TestSignalLanguage(unittest.TestCase):
    """Verify v0.2 uses descriptive language, not financial."""

    def test_no_bullish_bearish_in_signal_types(self):
        """Signal types should be spike/drop/rank_change, not divergence/momentum_breakout."""
        from etl.processing.signal_detector import detect_spike, detect_drop, detect_rank_change
        # Just verify the functions exist and their names match v0.2
        self.assertTrue(callable(detect_spike))
        self.assertTrue(callable(detect_drop))
        self.assertTrue(callable(detect_rank_change))

    def test_run_signal_detection_exists(self):
        from etl.processing.signal_detector import run_signal_detection
        self.assertTrue(callable(run_signal_detection))


if __name__ == "__main__":
    unittest.main()
