"""
Weekly Email Digest — AI Virality Index
Queries latest index data, renders Jinja2 template, sends via Resend API.

Usage:
  python -m etl.email_digest [--dry-run]

Requires: RESEND_API_KEY in .env
"""

import os
import sys
import json
import hashlib
import hmac
import requests
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

# Load config
sys.path.insert(0, str(Path(__file__).parent.parent))
from etl.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "AI Virality Index <digest@aiviralityindex.com>")
SITE_URL = os.getenv("SITE_URL", "https://aiviralityindex.com")
UNSUBSCRIBE_SECRET = os.getenv("UNSUBSCRIBE_SECRET", "avi-unsub-secret-2026")

# Supabase REST helpers
HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def supabase_get(table: str, params: str = "") -> list:
    """GET from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def get_active_subscribers() -> list[dict]:
    """Get all active newsletter subscribers."""
    return supabase_get(
        "newsletter_subscribers",
        "select=email&is_active=eq.true&order=subscribed_at.asc"
    )


def get_latest_scores() -> list[dict]:
    """Get latest index scores for all models."""
    data = supabase_get(
        "daily_scores",
        "select=vi_trade,vi_content,delta7_trade,delta7_content,date,models(slug,name,company,color)"
        "&order=date.desc&limit=49"
    )

    # Deduplicate — keep latest per model
    seen = set()
    latest = []
    for row in data:
        slug = row.get("models", {}).get("slug")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        latest.append(row)

    # Sort by vi_trade descending
    return sorted(latest, key=lambda x: x.get("vi_trade", 0), reverse=True)


def generate_unsubscribe_url(email: str) -> str:
    """Generate HMAC-signed unsubscribe URL."""
    token = hmac.new(
        UNSUBSCRIBE_SECRET.encode(),
        email.encode(),
        hashlib.sha256
    ).hexdigest()[:32]
    return f"{SITE_URL}/api/newsletter/unsubscribe?email={requests.utils.quote(email)}&token={token}"


def render_digest(scores: list[dict]) -> str:
    """Render the weekly digest HTML using Jinja2 template."""
    templates_dir = Path(__file__).parent / "templates"
    env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = env.get_template("weekly_digest.html")

    # Calculate averages and top mover
    avg_score = sum(s.get("vi_trade", 0) for s in scores) / max(len(scores), 1)

    top_mover = None
    max_abs_delta = 0
    for s in scores:
        d = abs(s.get("delta7_trade") or 0)
        if d > max_abs_delta:
            max_abs_delta = d
            top_mover = s

    return template.render(
        week_date=datetime.utcnow().strftime("%B %d, %Y"),
        scores=scores,
        avg_score=avg_score,
        top_mover=top_mover,
        site_url=SITE_URL,
        unsubscribe_url="{{UNSUBSCRIBE_URL}}",  # replaced per-recipient
    )


def send_email(to: str, subject: str, html: str) -> bool:
    """Send email via Resend API."""
    if not RESEND_API_KEY:
        print(f"  [SKIP] No RESEND_API_KEY — would send to {to}")
        return False

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": RESEND_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
        },
    )

    if resp.status_code in (200, 201):
        print(f"  [OK] Sent to {to}")
        return True
    else:
        print(f"  [ERR] Failed to send to {to}: {resp.status_code} {resp.text}")
        return False


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("AI Virality Index — Weekly Email Digest")
    print(f"Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print("=" * 60)

    # 1. Get subscribers
    subscribers = get_active_subscribers()
    print(f"\nActive subscribers: {len(subscribers)}")

    if not subscribers:
        print("No active subscribers. Exiting.")
        return

    # 2. Get latest scores
    scores = get_latest_scores()
    print(f"Models with scores: {len(scores)}")

    if not scores:
        print("No index data available. Exiting.")
        return

    # 3. Render template
    base_html = render_digest(scores)
    subject = f"AI Virality Weekly — {datetime.utcnow().strftime('%b %d, %Y')}"

    # 4. Send to each subscriber
    sent = 0
    failed = 0

    for sub in subscribers:
        email = sub["email"]
        unsub_url = generate_unsubscribe_url(email)
        html = base_html.replace("{{UNSUBSCRIBE_URL}}", unsub_url)

        if dry_run:
            print(f"  [DRY] Would send to {email}")
            sent += 1
        else:
            if send_email(email, subject, html):
                sent += 1
            else:
                failed += 1

    print(f"\n{'=' * 60}")
    print(f"Done. Sent: {sent}, Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
