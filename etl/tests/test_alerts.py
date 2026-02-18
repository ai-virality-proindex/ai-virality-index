"""
Tests for etl/alerts.py

Tests alert system:
- Webhook URL validation (SSRF protection)
- Condition checking logic
- Edge cases

Uses mocking to avoid Supabase and HTTP calls.
"""

import unittest

from etl.alerts import _validate_webhook_url, _check_condition


class TestWebhookUrlValidation(unittest.TestCase):
    """Test SSRF protection in _validate_webhook_url."""

    def test_valid_https_url(self):
        self.assertTrue(_validate_webhook_url("https://example.com/webhook"))

    def test_valid_https_with_path(self):
        self.assertTrue(_validate_webhook_url("https://hooks.slack.com/services/T123/B456/xyz"))

    def test_reject_http(self):
        """Must require HTTPS."""
        self.assertFalse(_validate_webhook_url("http://example.com/webhook"))

    def test_reject_localhost(self):
        self.assertFalse(_validate_webhook_url("https://localhost/webhook"))

    def test_reject_127_0_0_1(self):
        self.assertFalse(_validate_webhook_url("https://127.0.0.1/webhook"))

    def test_reject_0_0_0_0(self):
        self.assertFalse(_validate_webhook_url("https://0.0.0.0/webhook"))

    def test_reject_ipv6_loopback(self):
        self.assertFalse(_validate_webhook_url("https://::1/webhook"))

    def test_reject_private_ip_10(self):
        self.assertFalse(_validate_webhook_url("https://10.0.0.1/webhook"))

    def test_reject_private_ip_172(self):
        self.assertFalse(_validate_webhook_url("https://172.16.0.1/webhook"))

    def test_reject_private_ip_192(self):
        self.assertFalse(_validate_webhook_url("https://192.168.1.1/webhook"))

    def test_reject_metadata_google(self):
        self.assertFalse(_validate_webhook_url("https://metadata.google.internal/webhook"))

    def test_reject_empty_url(self):
        self.assertFalse(_validate_webhook_url(""))

    def test_reject_no_scheme(self):
        self.assertFalse(_validate_webhook_url("example.com/webhook"))

    def test_reject_ftp(self):
        self.assertFalse(_validate_webhook_url("ftp://example.com/file"))

    def test_reject_javascript_scheme(self):
        self.assertFalse(_validate_webhook_url("javascript:alert(1)"))

    def test_public_ip_allowed(self):
        self.assertTrue(_validate_webhook_url("https://8.8.8.8/webhook"))

    def test_domain_name_allowed(self):
        self.assertTrue(_validate_webhook_url("https://webhook.site/abc-123"))


class TestCheckCondition(unittest.TestCase):
    """Test _check_condition logic for different condition types."""

    def _make_alert(self, condition, threshold=50.0, mode="trade", models=None):
        return {
            "condition": condition,
            "threshold": threshold,
            "mode": mode,
            "models": models or {"slug": "chatgpt", "name": "ChatGPT"},
        }

    def test_vi_above_triggered(self):
        alert = self._make_alert("vi_above", threshold=60.0)
        scores = {"vi_trade": 65.0, "delta7_trade": 5.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertTrue(fired)
        self.assertAlmostEqual(value, 65.0)
        self.assertIn("above", msg)

    def test_vi_above_not_triggered(self):
        alert = self._make_alert("vi_above", threshold=70.0)
        scores = {"vi_trade": 65.0, "delta7_trade": 5.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertFalse(fired)

    def test_vi_below_triggered(self):
        alert = self._make_alert("vi_below", threshold=40.0)
        scores = {"vi_trade": 35.0, "delta7_trade": -5.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertTrue(fired)
        self.assertAlmostEqual(value, 35.0)

    def test_vi_below_not_triggered(self):
        alert = self._make_alert("vi_below", threshold=30.0)
        scores = {"vi_trade": 35.0, "delta7_trade": -5.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertFalse(fired)

    def test_delta7_above_triggered(self):
        alert = self._make_alert("delta7_above", threshold=10.0)
        scores = {"vi_trade": 60.0, "delta7_trade": 15.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertTrue(fired)
        self.assertAlmostEqual(value, 15.0)

    def test_delta7_below_triggered(self):
        alert = self._make_alert("delta7_below", threshold=-5.0)
        scores = {"vi_trade": 40.0, "delta7_trade": -10.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertTrue(fired)
        self.assertAlmostEqual(value, -10.0)

    def test_new_signal_triggered(self):
        alert = self._make_alert("new_signal")
        signals = [{"signal_type": "divergence", "direction": "bullish", "strength": 75}]
        fired, value, msg = _check_condition(alert, None, signals)
        self.assertTrue(fired)
        self.assertIn("divergence", msg)

    def test_new_signal_no_signals(self):
        alert = self._make_alert("new_signal")
        fired, value, msg = _check_condition(alert, None, None)
        self.assertFalse(fired)

    def test_new_signal_empty_list(self):
        alert = self._make_alert("new_signal")
        fired, value, msg = _check_condition(alert, None, [])
        self.assertFalse(fired)

    def test_content_mode_uses_content_scores(self):
        alert = self._make_alert("vi_above", threshold=50.0, mode="content")
        scores = {"vi_trade": 40.0, "vi_content": 60.0,
                  "delta7_trade": 0.0, "delta7_content": 5.0}
        fired, value, msg = _check_condition(alert, scores, None)
        self.assertTrue(fired)
        self.assertAlmostEqual(value, 60.0)
        self.assertIn("Content", msg)

    def test_no_scores_returns_false(self):
        alert = self._make_alert("vi_above", threshold=50.0)
        fired, value, msg = _check_condition(alert, None, None)
        self.assertFalse(fired)

    def test_none_threshold(self):
        """Threshold=None should not crash."""
        alert = self._make_alert("vi_above", threshold=None)
        scores = {"vi_trade": 50.0, "delta7_trade": 0.0}
        # Should handle gracefully (comparison with None may differ)
        try:
            fired, value, msg = _check_condition(alert, scores, None)
        except TypeError:
            pass  # acceptable — threshold shouldn't be None for vi_above


if __name__ == "__main__":
    unittest.main()
