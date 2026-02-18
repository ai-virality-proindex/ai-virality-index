"""
Polymarket Trainer — Bet Resolution.

Runs after daily index calculation to resolve expired simulation bets.
Checks the actual VI_trade value on the expiry date and marks bets as won/lost.
"""

import logging
from datetime import date
from typing import Any

from etl.storage.supabase_client import get_client

logger = logging.getLogger(__name__)


def resolve_expired_bets(calc_date: date) -> dict[str, Any]:
    """
    Resolve all simulation bets that have expired on or before calc_date.

    For each active bet where expires_at <= calc_date:
        1. Fetch the daily_scores for the bet's model on the expiry date
        2. Compare vi_trade against threshold + direction
        3. Update bet status to 'won' or 'lost'

    Args:
        calc_date: Current date (usually today).

    Returns:
        Summary dict: {'resolved': int, 'won': int, 'lost': int}
    """
    client = get_client()

    # Fetch active bets that have expired
    result = (
        client.table("sim_bets")
        .select("*")
        .eq("status", "active")
        .lte("expires_at", calc_date.isoformat())
        .execute()
    )

    bets = result.data
    if not bets:
        logger.info("No expired simulation bets to resolve.")
        return {"resolved": 0, "won": 0, "lost": 0}

    logger.info(f"Resolving {len(bets)} expired simulation bet(s)...")

    won = 0
    lost = 0

    for bet in bets:
        model_id = bet["model_id"]
        expires_at = bet["expires_at"]

        # Fetch the VI_trade score for the model on expiry date
        score_result = (
            client.table("daily_scores")
            .select("vi_trade")
            .eq("model_id", model_id)
            .eq("date", expires_at)
            .maybeSingle()
            .execute()
        )

        if not score_result.data:
            # Fallback: use the latest available score before the expiry date
            fallback = (
                client.table("daily_scores")
                .select("vi_trade, date")
                .eq("model_id", model_id)
                .lte("date", expires_at)
                .order("date", desc=True)
                .limit(1)
                .execute()
            )
            if not fallback.data:
                logger.warning(
                    f"  Bet {bet['id']}: no scores available for model {model_id} "
                    f"on or before {expires_at}. Skipping."
                )
                continue
            actual_vi = float(fallback.data[0]["vi_trade"])
        else:
            actual_vi = float(score_result.data["vi_trade"])

        # Determine outcome
        direction = bet["direction"]
        threshold = float(bet["threshold"])

        if direction == "above":
            is_won = actual_vi >= threshold
        else:  # 'below'
            is_won = actual_vi <= threshold

        status = "won" if is_won else "lost"
        payout = float(bet["potential_payout"]) if is_won else 0.0

        # Update the bet
        (
            client.table("sim_bets")
            .update(
                {
                    "status": status,
                    "index_at_resolution": actual_vi,
                    "payout": payout,
                    "resolved_at": calc_date.isoformat(),
                }
            )
            .eq("id", bet["id"])
            .execute()
        )

        if is_won:
            won += 1
        else:
            lost += 1

        logger.info(
            f"  Bet {bet['id']}: {direction} {threshold} -> "
            f"actual={actual_vi:.1f} -> {status} "
            f"(payout=${payout:.2f})"
        )

    logger.info(
        f"Resolution complete: {len(bets)} resolved, {won} won, {lost} lost"
    )

    return {"resolved": len(bets), "won": won, "lost": lost}
