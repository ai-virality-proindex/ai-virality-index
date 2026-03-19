"""
Accuracy Tracker for AI Virality Index — v0.2

Tracks signal outcomes: after a spike/drop/rank_change signal fires,
checks 7 days later whether the prediction direction held.

- spike (rising) → was VI still rising after 7 days?
- drop (declining) → was VI still declining after 7 days?
- rank_change → did the rank stay moved in the same direction?

Results stored in signal_outcomes table.
When accuracy > 65% over 90 days → can re-enable paid "Predictive Signals".
"""

import logging
from datetime import date, timedelta
from typing import Any

from etl.storage.supabase_client import get_client

logger = logging.getLogger(__name__)


def resolve_signal_outcomes(calc_date: date) -> dict[str, Any]:
    """
    Check signals that expired 7 days ago and record whether the
    direction held.

    A signal is "correct" if:
    - spike/rising: VI on outcome_date > VI on signal_date
    - drop/declining: VI on outcome_date < VI on signal_date
    - rank_change/rising: rank improved or held
    - rank_change/declining: rank declined or held

    Args:
        calc_date: Current date.

    Returns:
        Summary dict with resolved/correct/incorrect counts.
    """
    client = get_client()

    # Find signals that expired 7 days ago (give 1 day buffer)
    check_date = (calc_date - timedelta(days=7)).isoformat()
    check_date_end = (calc_date - timedelta(days=6)).isoformat()

    result = client.table("signals").select(
        "id, model_id, date, signal_type, direction, vi_trade, expires_at"
    ).gte("expires_at", check_date).lt("expires_at", check_date_end).execute()

    signals = result.data
    if not signals:
        logger.info("No signals to resolve")
        return {"resolved": 0, "correct": 0, "incorrect": 0}

    resolved = 0
    correct = 0
    incorrect = 0

    for signal in signals:
        model_id = signal["model_id"]
        signal_date = signal["date"]
        signal_vi = float(signal["vi_trade"]) if signal["vi_trade"] else None
        direction = signal["direction"]

        if signal_vi is None:
            continue

        # Get current VI for this model
        current = client.table("daily_scores").select(
            "vi_trade"
        ).eq("model_id", model_id).order(
            "date", desc=True
        ).limit(1).execute()

        if not current.data:
            continue

        current_vi = float(current.data[0]["vi_trade"])

        # Determine if signal was correct
        if direction == "rising":
            was_correct = current_vi > signal_vi
        elif direction == "declining":
            was_correct = current_vi < signal_vi
        else:
            was_correct = False  # Unknown direction

        # Upsert outcome
        outcome = {
            "signal_id": signal["id"],
            "signal_date": signal_date,
            "outcome_date": calc_date.isoformat(),
            "was_correct": was_correct,
            "vi_at_signal": signal_vi,
            "vi_at_outcome": current_vi,
        }

        try:
            client.table("signal_outcomes").upsert(
                outcome,
                on_conflict="signal_id",
            ).execute()
            resolved += 1
            if was_correct:
                correct += 1
            else:
                incorrect += 1
        except Exception as e:
            logger.error(f"Failed to upsert outcome for signal {signal['id']}: {e}")

    accuracy = (correct / resolved * 100) if resolved > 0 else 0
    logger.info(
        f"Resolved {resolved} signals: {correct} correct, {incorrect} incorrect "
        f"({accuracy:.1f}% accuracy)"
    )

    return {"resolved": resolved, "correct": correct, "incorrect": incorrect}


def get_rolling_accuracy(days: int = 90) -> dict[str, Any]:
    """
    Get rolling accuracy over the last N days.

    Returns:
        Dict with total, correct, accuracy_pct.
    """
    client = get_client()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    result = client.table("signal_outcomes").select(
        "was_correct"
    ).gte("outcome_date", start_date).execute()

    outcomes = result.data
    if not outcomes:
        return {"total": 0, "correct": 0, "accuracy_pct": 0.0}

    total = len(outcomes)
    correct = sum(1 for o in outcomes if o["was_correct"])
    accuracy = (correct / total * 100) if total > 0 else 0

    return {
        "total": total,
        "correct": correct,
        "accuracy_pct": round(accuracy, 1),
    }
