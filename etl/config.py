"""
Configuration loader for AI Virality Index ETL pipeline.
Loads environment variables from .env file.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")


# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# --- YouTube Data API ---
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# --- GitHub ---
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# --- Reddit ---
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "AVI/1.0")

# --- Upstash Redis ---
UPSTASH_REDIS_URL = os.getenv("UPSTASH_REDIS_URL", "")
UPSTASH_REDIS_TOKEN = os.getenv("UPSTASH_REDIS_TOKEN", "")

# --- Resend (email digest) ---
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

# --- Index Configuration ---
MODELS_CONFIG_PATH = Path(__file__).parent / "models_config.yaml"

# --- Index Weights ---
# Q (Arena Elo) removed from formula — static data, measures quality not virality.
# Replaced with D (Dev Adoption) = npm + PyPI daily SDK downloads.
WEIGHTS_TRADE = {
    "T": 0.18,  # Trends (search interest) — moderate volatility, good signal
    "S": 0.20,  # Social (YouTube + HackerNews) — reduced: too volatile for higher weight
    "G": 0.12,  # GitHub (star/fork velocity) — reduced: correlated with D (+0.50)
    "N": 0.15,  # News (GDELT mentions) — increased: best leading indicator (1-2d lead)
    "D": 0.20,  # Dev Adoption (npm + PyPI downloads) — increased: most stable & reliable
    "M": 0.15,  # Mindshare (Wikipedia pageviews) — increased: broader coverage
}

WEIGHTS_CONTENT = {
    "T": 0.25,  # Trends — search demand = audience looking for guides
    "S": 0.25,  # Social (YouTube + HackerNews) — reduced: was too dominant
    "G": 0.05,  # GitHub — developers matter less for content
    "N": 0.25,  # News — increased: best content predictor & content hooks
    "D": 0.05,  # Dev Adoption (npm + PyPI downloads) — less relevant for content
    "M": 0.15,  # Mindshare (Wikipedia pageviews) — increased: captures public interest
}

# --- EWMA Smoothing ---
EWMA_ALPHA_TRADE = 0.35
EWMA_ALPHA_CONTENT = 0.25

# --- Normalization ---
QUANTILE_WINDOW = 90  # days
QUANTILE_LOW = 0.05
QUANTILE_HIGH = 0.95

# --- D Component Minimum Threshold ---
# DeepSeek raw D = 0-169 downloads but quantile normalization stretched it to 80/100.
# Any model with raw downloads < this threshold gets D=0 to prevent false scores.
D_RAW_MIN_THRESHOLD = 1000  # daily downloads

# --- Weight Redistribution for Non-SDK Models ---
# Models without SDK packages (Copilot, Grok, Perplexity) have D=0 permanently.
# Instead of penalizing them with 20% dead weight, redistribute D weight
# proportionally across remaining components.
def get_weights_for_model(mode: str, has_sdk: bool) -> dict[str, float]:
    """Return weight dict, redistributing D weight if model has no SDK packages."""
    base = WEIGHTS_TRADE if mode == "trade" else WEIGHTS_CONTENT
    if has_sdk:
        return base

    d_weight = base["D"]
    remaining = {k: v for k, v in base.items() if k != "D"}
    remaining_sum = sum(remaining.values())

    # Redistribute D weight proportionally
    redistributed = {}
    for k, v in base.items():
        if k == "D":
            redistributed[k] = 0.0
        else:
            redistributed[k] = round(v + d_weight * (v / remaining_sum), 4)

    return redistributed


def validate_config() -> dict[str, bool]:
    """Check which API keys are configured."""
    return {
        "supabase": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
        "youtube": bool(YOUTUBE_API_KEY),
        "github": bool(GITHUB_TOKEN),
        "reddit": bool(REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET),
        "upstash": bool(UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN),
    }


if __name__ == "__main__":
    # Quick check: python -m etl.config
    status = validate_config()
    print("API Key Status:")
    for service, ok in status.items():
        icon = "OK" if ok else "MISSING"
        print(f"  {service}: {icon}")
