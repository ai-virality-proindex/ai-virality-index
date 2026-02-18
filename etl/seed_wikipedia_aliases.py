"""
One-time script to seed Wikipedia article title aliases into model_aliases table.
Run: python -m etl.seed_wikipedia_aliases
"""

import yaml
from etl.config import MODELS_CONFIG_PATH
from etl.storage.supabase_client import get_client, get_model_id


def main():
    # Load models_config.yaml
    with open(MODELS_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    client = get_client()
    total = 0

    for slug, model_cfg in config["models"].items():
        articles = model_cfg.get("wikipedia_articles", [])
        if not articles:
            print(f"  {slug}: no wikipedia_articles, skipping")
            continue

        model_id = get_model_id(slug)
        if not model_id:
            print(f"  {slug}: model not found in DB, skipping")
            continue

        rows = [
            {
                "model_id": model_id,
                "alias_type": "wikipedia_article",
                "alias_value": article,
            }
            for article in articles
        ]

        result = (
            client.table("model_aliases")
            .upsert(rows, on_conflict="model_id,alias_type,alias_value")
            .execute()
        )
        print(f"  {slug}: inserted {len(rows)} wikipedia_article aliases")
        total += len(rows)

    print(f"\nDone! Total Wikipedia aliases inserted: {total}")


if __name__ == "__main__":
    main()
