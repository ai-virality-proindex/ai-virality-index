"""
AI Virality Index — ETL Pipeline Orchestrator

Runs all data collectors for all tracked models, upserts results to Supabase,
then calculates the composite index and detects trading signals.

Usage:
    python -m etl.main                       # Full run: fetch + calculate + signals
    python -m etl.main --model chatgpt       # Single model
    python -m etl.main --source youtube      # Single source
    python -m etl.main --dry-run             # Fetch but don't write to DB
    python -m etl.main --skip-fetch          # Skip fetch, only recalculate index + signals
    python -m etl.main --model chatgpt --source github --dry-run
"""

import argparse
import logging
import sys
import time
from datetime import date
from typing import Any

from etl.storage.supabase_client import (
    get_all_models,
    get_model_id,
    get_aliases,
    upsert_raw_metrics,
)
from etl.collectors.trends import TrendsCollector
from etl.collectors.youtube import YouTubeCollector
from etl.collectors.hackernews import HackerNewsCollector
from etl.collectors.github_collector import GitHubCollector
from etl.collectors.news import GDELTNewsCollector
from etl.collectors.quality import QualityCollector
from etl.collectors.wikipedia import WikipediaCollector
from etl.collectors.devadoption import DevAdoptionCollector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("etl.main")

# Map source name -> (CollectorClass, alias_type used in Supabase)
COLLECTOR_REGISTRY: dict[str, tuple[type, str]] = {
    "trends":     (TrendsCollector,      "search_query"),
    "youtube":    (YouTubeCollector,      "search_query"),
    "hackernews": (HackerNewsCollector,   "hn_query"),
    "github":     (GitHubCollector,       "github_repo"),
    "gdelt":      (GDELTNewsCollector,    "gdelt_query"),
    # arena: kept for metadata (Elo badge) but NOT in index formula (replaced by D)
    "arena":      (QualityCollector,      "arena_name"),
    "wikipedia":  (WikipediaCollector,     "wikipedia_article"),
    "devadoption": (DevAdoptionCollector,  "devadoption_package"),
}

# Sources that are slow/fragile and need extra delay between models
SLOW_SOURCES = {"trends", "gdelt"}


def run_pipeline(
    target_model: str | None = None,
    target_source: str | None = None,
    dry_run: bool = False,
    skip_fetch: bool = False,
) -> dict[str, Any]:
    """
    Run the ETL pipeline: fetch -> calculate index -> detect signals.

    Args:
        target_model: If set, only process this model slug.
        target_source: If set, only run this source collector.
        dry_run: If True, fetch data but don't write to DB.
        skip_fetch: If True, skip data fetching and only recalculate.

    Returns:
        Summary dict with counts.
    """
    today = date.today()
    logger.info(f"{'='*60}")
    logger.info(f"ETL Pipeline — {today}")
    logger.info(f"{'='*60}")

    if dry_run:
        logger.info("DRY RUN — data will NOT be written to Supabase")
    if skip_fetch:
        logger.info("SKIP FETCH — only recalculating index + signals")

    total_metrics = 0
    total_errors = 0
    results_summary: list[dict] = []

    # ── Step 1: Data Fetch ──
    if not skip_fetch:
        # Load models from Supabase
        models = get_all_models()
        if target_model:
            models = [m for m in models if m["slug"] == target_model]
            if not models:
                logger.error(f"Model '{target_model}' not found in Supabase")
                return {"error": f"Model not found: {target_model}"}
        logger.info(f"Processing {len(models)} model(s)")

        # Determine which sources to run
        sources = list(COLLECTOR_REGISTRY.keys())
        if target_source:
            if target_source not in COLLECTOR_REGISTRY:
                logger.error(
                    f"Unknown source '{target_source}'. "
                    f"Available: {', '.join(COLLECTOR_REGISTRY.keys())}"
                )
                return {"error": f"Unknown source: {target_source}"}
            sources = [target_source]
        logger.info(f"Running sources: {', '.join(sources)}")

        # Initialize collectors (once, reused across models)
        collectors: dict[str, Any] = {}
        for source_name in sources:
            collector_cls, _ = COLLECTOR_REGISTRY[source_name]
            try:
                collectors[source_name] = collector_cls()
                logger.info(f"Initialized {source_name} collector")
            except Exception as e:
                logger.error(f"Failed to init {source_name} collector: {e}")

        # Run fetch pipeline
        for model in models:
            slug = model["slug"]
            model_id = model["id"]
            logger.info(f"\n--- {slug} ({model['name']} by {model['company']}) ---")

            for source_name, collector in collectors.items():
                _, alias_type = COLLECTOR_REGISTRY[source_name]

                # Get aliases for this model+source
                try:
                    aliases = get_aliases(model_id, alias_type)
                except Exception as e:
                    logger.error(f"  {source_name}: failed to fetch aliases — {e}")
                    total_errors += 1
                    results_summary.append({
                        "model": slug,
                        "source": source_name,
                        "metrics": 0,
                        "status": f"ERROR: aliases fetch failed — {e}",
                    })
                    continue

                try:
                    result = collector.fetch(slug, aliases)

                    if result is None:
                        logger.warning(f"  {source_name}: returned None")
                        total_errors += 1
                        continue

                    metrics = result.get("metrics", {})
                    metric_count = len([v for v in metrics.values() if v is not None])

                    if not dry_run:
                        upsert_raw_metrics(
                            model_id=model_id,
                            metric_date=date.fromisoformat(result["date"]),
                            source=result["source"],
                            metrics=metrics,
                            raw_json=result.get("raw_json"),
                        )

                    total_metrics += metric_count
                    results_summary.append({
                        "model": slug,
                        "source": source_name,
                        "metrics": metric_count,
                        "status": "OK",
                    })
                    logger.info(f"  {source_name}: {metric_count} metrics OK")

                except Exception as e:
                    total_errors += 1
                    results_summary.append({
                        "model": slug,
                        "source": source_name,
                        "metrics": 0,
                        "status": f"ERROR: {e}",
                    })
                    logger.error(f"  {source_name}: FAILED — {e}")

                # Small delay between sources
                if source_name in SLOW_SOURCES:
                    time.sleep(2.0)
                else:
                    time.sleep(0.5)

        ok_count = sum(1 for r in results_summary if r["status"] == "OK")
        logger.info(f"\nFetch complete: {ok_count} OK, {total_errors} errors, {total_metrics} metrics")

    # ── Step 2: Index Calculation ──
    index_result = {"models_calculated": 0, "models_total": 0}
    if not dry_run:
        logger.info(f"\n{'='*60}")
        logger.info("Step 2: Index Calculation")
        logger.info(f"{'='*60}")
        try:
            from etl.processing.index_calculator import run_daily_calculation
            index_result = run_daily_calculation(today)
            logger.info(
                f"Index calculated for {index_result['models_calculated']}"
                f"/{index_result['models_total']} models."
            )
        except Exception as e:
            logger.error(f"Index calculation failed: {e}")

    # ── Step 3: Signal Detection ──
    signals_detected = 0
    if not dry_run:
        logger.info(f"\n{'='*60}")
        logger.info("Step 3: Signal Detection")
        logger.info(f"{'='*60}")
        try:
            from etl.processing.signal_detector import run_signal_detection
            signals = run_signal_detection(today)
            signals_detected = len(signals)
            logger.info(f"{signals_detected} signals detected.")
        except Exception as e:
            logger.error(f"Signal detection failed: {e}")

    # ── Step 4: Alert Checks ──
    alerts_result = {"checked": 0, "triggered": 0, "delivered": 0}
    if not dry_run:
        logger.info(f"\n{'='*60}")
        logger.info("Step 4: Alert Checks")
        logger.info(f"{'='*60}")
        try:
            from etl.alerts import run_alert_checks
            alerts_result = run_alert_checks(today)
            logger.info(
                f"{alerts_result['triggered']} alert(s) triggered, "
                f"{alerts_result['delivered']} delivered."
            )
        except Exception as e:
            logger.error(f"Alert checks failed: {e}")

    # ── Step 5: Trainer Bet Resolution ──
    trainer_result = {"resolved": 0, "won": 0, "lost": 0}
    if not dry_run:
        logger.info(f"\n{'='*60}")
        logger.info("Step 5: Trainer Bet Resolution")
        logger.info(f"{'='*60}")
        try:
            from etl.trainer import resolve_expired_bets
            trainer_result = resolve_expired_bets(today)
            logger.info(
                f"{trainer_result['resolved']} bet(s) resolved: "
                f"{trainer_result['won']} won, {trainer_result['lost']} lost."
            )
        except Exception as e:
            logger.error(f"Trainer bet resolution failed: {e}")

    # ── Summary ──
    logger.info(f"\n{'='*60}")
    logger.info(f"ETL Pipeline Complete — {today}")
    logger.info(f"{'='*60}")
    if not skip_fetch:
        ok_count = sum(1 for r in results_summary if r["status"] == "OK")
        logger.info(f"Fetch: {ok_count} OK, {total_errors} errors, {total_metrics} metrics")
    else:
        logger.info("Fetch: SKIPPED")
    logger.info(
        f"Index: {index_result.get('models_calculated', 0)}"
        f"/{index_result.get('models_total', 0)} models"
    )
    logger.info(f"Signals: {signals_detected} detected")
    logger.info(
        f"Alerts: {alerts_result.get('checked', 0)} checked, "
        f"{alerts_result.get('triggered', 0)} triggered, "
        f"{alerts_result.get('delivered', 0)} delivered"
    )
    logger.info(
        f"Trainer: {trainer_result.get('resolved', 0)} bets resolved, "
        f"{trainer_result.get('won', 0)} won, {trainer_result.get('lost', 0)} lost"
    )
    if dry_run:
        logger.info("(DRY RUN — nothing was written to Supabase)")
    logger.info(f"{'='*60}")

    return {
        "date": today.isoformat(),
        "models_processed": index_result.get("models_total", 0),
        "sources_ok": sum(1 for r in results_summary if r["status"] == "OK"),
        "sources_errors": total_errors,
        "total_metrics": total_metrics,
        "models_calculated": index_result.get("models_calculated", 0),
        "signals_detected": signals_detected,
        "alerts_triggered": alerts_result.get("triggered", 0),
        "alerts_delivered": alerts_result.get("delivered", 0),
        "trainer_resolved": trainer_result.get("resolved", 0),
        "trainer_won": trainer_result.get("won", 0),
        "trainer_lost": trainer_result.get("lost", 0),
        "dry_run": dry_run,
        "skip_fetch": skip_fetch,
        "details": results_summary,
    }


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="AI Virality Index — ETL Pipeline",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Process only this model slug (e.g., chatgpt, gemini)",
    )
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help=(
            "Run only this source collector. "
            f"Options: {', '.join(COLLECTOR_REGISTRY.keys())}"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch data but don't write to Supabase",
    )
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Skip data fetching, only recalculate index and detect signals",
    )

    args = parser.parse_args()

    summary = run_pipeline(
        target_model=args.model,
        target_source=args.source,
        dry_run=args.dry_run,
        skip_fetch=args.skip_fetch,
    )

    # Exit with error code if there were failures
    if summary.get("sources_errors", 0) > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
