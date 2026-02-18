"""
Alert Checker for AI Virality Index.

Runs after daily index calculation to check user-defined alert conditions
and send notifications (webhook/email) when thresholds are crossed.

Alert conditions:
    - vi_above: VI score exceeds threshold
    - vi_below: VI score drops below threshold
    - delta7_above: 7-day change exceeds threshold
    - delta7_below: 7-day change drops below threshold
    - new_signal: any new trading signal detected for the model
"""

import json
import logging
from datetime import date
from typing import Any

import httpx

from etl.storage.supabase_client import get_client, get_all_models

logger = logging.getLogger(__name__)


def _get_latest_scores(calc_date: date) -> dict[str, dict[str, Any]]:
    """Fetch today's daily_scores for all models, keyed by model_id."""
    client = get_client()
    result = (
        client.table("daily_scores")
        .select("model_id, vi_trade, vi_content, delta7_trade, delta7_content, signal_trade, heat_content")
        .eq("date", calc_date.isoformat())
        .execute()
    )
    return {row["model_id"]: row for row in result.data}


def _get_todays_signals(calc_date: date) -> dict[str, list[dict]]:
    """Fetch today's signals grouped by model_id."""
    client = get_client()
    result = (
        client.table("signals")
        .select("model_id, signal_type, direction, strength, reasoning")
        .eq("date", calc_date.isoformat())
        .execute()
    )
    grouped: dict[str, list[dict]] = {}
    for row in result.data:
        mid = row["model_id"]
        grouped.setdefault(mid, []).append(row)
    return grouped


def _get_active_alerts() -> list[dict[str, Any]]:
    """Fetch all active alerts with model info."""
    client = get_client()
    result = (
        client.table("alerts")
        .select("*, models(slug, name)")
        .eq("is_active", True)
        .execute()
    )
    return result.data


def _check_condition(
    alert: dict,
    scores: dict[str, Any] | None,
    signals: list[dict] | None,
) -> tuple[bool, float | None, str]:
    """
    Check if an alert condition is met.

    Returns:
        (triggered, value, message)
    """
    condition = alert["condition"]
    threshold = float(alert["threshold"]) if alert["threshold"] is not None else None
    mode = alert.get("mode", "trade")
    model_name = alert.get("models", {}).get("name", "Unknown")
    model_slug = alert.get("models", {}).get("slug", "unknown")

    if condition == "new_signal":
        if signals and len(signals) > 0:
            sig = signals[0]
            msg = (
                f"New {sig['signal_type']} signal for {model_name}: "
                f"{sig['direction']}, strength {sig['strength']}"
            )
            return True, sig.get("strength", 0), msg
        return False, None, ""

    if scores is None:
        return False, None, ""

    # Pick the right score field based on mode
    vi_key = "vi_trade" if mode == "trade" else "vi_content"
    d7_key = "delta7_trade" if mode == "trade" else "delta7_content"
    mode_label = "Trading" if mode == "trade" else "Content"

    if condition == "vi_above":
        value = float(scores.get(vi_key, 0) or 0)
        if value > threshold:
            msg = f"{model_name} {mode_label} Index is {value:.1f} (above {threshold})"
            return True, value, msg

    elif condition == "vi_below":
        value = float(scores.get(vi_key, 0) or 0)
        if value < threshold:
            msg = f"{model_name} {mode_label} Index is {value:.1f} (below {threshold})"
            return True, value, msg

    elif condition == "delta7_above":
        value = float(scores.get(d7_key, 0) or 0)
        if value > threshold:
            msg = f"{model_name} {mode_label} 7-day change is {value:+.1f} (above {threshold:+.1f})"
            return True, value, msg

    elif condition == "delta7_below":
        value = float(scores.get(d7_key, 0) or 0)
        if value < threshold:
            msg = f"{model_name} {mode_label} 7-day change is {value:+.1f} (below {threshold:+.1f})"
            return True, value, msg

    return False, None, ""


def _send_webhook(url: str, payload: dict) -> bool:
    """Send alert payload to a webhook URL."""
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json", "User-Agent": "AVI-Alerts/1.0"},
            timeout=10,
        )
        if response.status_code < 300:
            logger.info(f"Webhook delivered: {url} -> {response.status_code}")
            return True
        else:
            logger.warning(f"Webhook failed: {url} -> {response.status_code}")
            return False
    except Exception as e:
        logger.error(f"Webhook error: {url} -> {e}")
        return False


def run_alert_checks(calc_date: date) -> dict[str, Any]:
    """
    Check all active alerts against today's scores and signals.
    Send notifications for triggered alerts.

    Args:
        calc_date: Date to check alerts for.

    Returns:
        Summary dict with counts.
    """
    client = get_client()

    # Load data
    scores = _get_latest_scores(calc_date)
    signals = _get_todays_signals(calc_date)
    alerts = _get_active_alerts()

    if not alerts:
        logger.info("No active alerts to check.")
        return {"checked": 0, "triggered": 0, "delivered": 0}

    logger.info(f"Checking {len(alerts)} active alert(s)...")

    triggered_count = 0
    delivered_count = 0

    for alert in alerts:
        model_id = alert["model_id"]
        model_scores = scores.get(model_id)
        model_signals = signals.get(model_id)

        fired, value, message = _check_condition(alert, model_scores, model_signals)

        if not fired:
            continue

        triggered_count += 1
        logger.info(f"  Alert triggered: {message}")

        # Record in alert_history
        history_row = {
            "alert_id": alert["id"],
            "user_id": alert["user_id"],
            "model_id": model_id,
            "condition": alert["condition"],
            "triggered_value": value,
            "threshold": alert.get("threshold"),
            "message": message,
            "delivered": False,
        }

        # Send notification based on channel
        delivered = False
        if alert["channel"] == "webhook" and alert.get("webhook_url"):
            payload = {
                "event": "alert_triggered",
                "alert_id": alert["id"],
                "model": alert.get("models", {}).get("slug", "unknown"),
                "model_name": alert.get("models", {}).get("name", "Unknown"),
                "condition": alert["condition"],
                "threshold": alert.get("threshold"),
                "value": value,
                "message": message,
                "date": calc_date.isoformat(),
            }
            delivered = _send_webhook(alert["webhook_url"], payload)
        elif alert["channel"] == "email":
            # Email delivery is a future enhancement
            # For now, log it and mark as delivered
            logger.info(f"  Email alert (not yet implemented): {message}")
            delivered = True

        history_row["delivered"] = delivered
        if delivered:
            delivered_count += 1

        # Write to alert_history
        try:
            client.table("alert_history").insert(history_row).execute()
        except Exception as e:
            logger.error(f"  Failed to write alert_history: {e}")

        # Update last_triggered_at on the alert
        try:
            client.table("alerts").update(
                {"last_triggered_at": calc_date.isoformat()}
            ).eq("id", alert["id"]).execute()
        except Exception as e:
            logger.error(f"  Failed to update alert last_triggered_at: {e}")

    logger.info(
        f"Alert checks complete: {len(alerts)} checked, "
        f"{triggered_count} triggered, {delivered_count} delivered"
    )

    return {
        "checked": len(alerts),
        "triggered": triggered_count,
        "delivered": delivered_count,
    }
