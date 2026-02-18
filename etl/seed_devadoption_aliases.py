"""
One-time script to seed devadoption_package aliases into model_aliases table.
Run: python -m etl.seed_devadoption_aliases
"""

import yaml
from etl.config import MODELS_CONFIG_PATH
from etl.storage.supabase_client import get_client, get_model_id


def main():
    with open(MODELS_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    client = get_client()
    total = 0

    for slug, model_cfg in config["models"].items():
        packages = model_cfg.get("devadoption_packages", [])
        if not packages:
            print(f"  {slug}: no devadoption_packages, skipping")
            continue

        model_id = get_model_id(slug)
        if not model_id:
            print(f"  {slug}: model not found in DB, skipping")
            continue

        rows = [
            {
                "model_id": model_id,
                "alias_type": "devadoption_package",
                "alias_value": pkg,
            }
            for pkg in packages
        ]

        result = (
            client.table("model_aliases")
            .upsert(rows, on_conflict="model_id,alias_type,alias_value")
            .execute()
        )
        print(f"  {slug}: inserted {len(rows)} devadoption_package aliases")
        total += len(rows)

    print(f"\nDone! Total devadoption aliases inserted: {total}")


if __name__ == "__main__":
    main()
