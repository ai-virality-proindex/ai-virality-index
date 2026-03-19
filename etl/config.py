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

# --- Index Weights (v0.2: single 5-component formula, D dropped) ---
# D (Dev Adoption) removed: 45% zeros, 4/7 models have no SDK.
# Data still collected but not in the formula.
WEIGHTS = {
    "T": 0.25,  # Trends (search interest) — reliable, works for all 7 models
    "S": 0.25,  # Social (YouTube + HackerNews) — reliable, works for all 7 models
    "G": 0.10,  # GitHub (star/fork velocity) — works for 5/7, redistributed for Copilot/Perplexity
    "N": 0.25,  # News (GDELT mentions) — best leading indicator, works for all 7
    "M": 0.15,  # Mindshare (Wikipedia pageviews) — stable baseline
}

# Backward compat aliases (used by tests and old code paths)
WEIGHTS_TRADE = WEIGHTS
WEIGHTS_CONTENT = WEIGHTS

# --- EWMA Smoothing ---
EWMA_ALPHA = 0.30  # Single smoothing factor
EWMA_ALPHA_TRADE = EWMA_ALPHA  # backward compat
EWMA_ALPHA_CONTENT = EWMA_ALPHA

# --- Normalization ---
QUANTILE_WINDOW = 90  # days
QUANTILE_LOW = 0.05
QUANTILE_HIGH = 0.95

# --- D Component Minimum Threshold ---
# DeepSeek raw D = 0-169 downloads but quantile normalization stretched it to 80/100.
# Any model with raw downloads < this threshold gets D=0 to prevent false scores.
D_RAW_MIN_THRESHOLD = 1000  # daily downloads

# --- Weight Redistribution for Models Without GitHub ---
# Copilot and Perplexity have G=0 permanently (no public GitHub repos).
# Redistribute G weight proportionally across T, S, N, M.
def get_weights_for_model(mode: str = "trade", has_github: bool = True, has_sdk: bool = True) -> dict[str, float]:
    """Return weight dict, redistributing G weight if model has no GitHub repos."""
    base = dict(WEIGHTS)
    if has_github:
        return base

    g_weight = base["G"]
    remaining = {k: v for k, v in base.items() if k != "G"}
    remaining_sum = sum(remaining.values())

    redistributed = {}
    for k, v in base.items():
        if k == "G":
            redistributed[k] = 0.0
        else:
            redistributed[k] = round(v + g_weight * (v / remaining_sum), 4)

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
