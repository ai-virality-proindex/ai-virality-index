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

# --- Index Configuration ---
MODELS_CONFIG_PATH = Path(__file__).parent / "models_config.yaml"

# --- Index Weights ---
WEIGHTS_TRADE = {
    "T": 0.20,  # Trends (search interest)
    "S": 0.20,  # Social (YouTube + HackerNews + Reddit when available)
    "G": 0.15,  # GitHub (developer adoption)
    "N": 0.10,  # News (GDELT mentions)
    "Q": 0.20,  # Quality (Arena Elo)
    "M": 0.15,  # Market (Polymarket odds)
}

WEIGHTS_CONTENT = {
    "T": 0.28,  # Trends
    "S": 0.32,  # Social (YouTube + HackerNews + Reddit when available)
    "G": 0.08,  # GitHub
    "N": 0.20,  # News
    "Q": 0.05,  # Quality
    "M": 0.07,  # Market
}

# --- EWMA Smoothing ---
EWMA_ALPHA_TRADE = 0.35
EWMA_ALPHA_CONTENT = 0.25

# --- Normalization ---
QUANTILE_WINDOW = 90  # days
QUANTILE_LOW = 0.05
QUANTILE_HIGH = 0.95


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
