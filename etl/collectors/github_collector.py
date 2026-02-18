"""
GitHub collector — fetches stars, forks, issues via GitHub REST API.

Uses authenticated GitHub REST API (5,000 req/hour) to collect repository
metrics for AI model SDKs and repos.

Metrics collected:
- total_stars: sum of stargazers across all repos for the model
- total_forks: sum of forks across all repos
- total_open_issues: sum of open issues
- stars_delta_1d: star growth vs yesterday (requires previous day data)
- forks_delta_1d: fork growth vs yesterday
"""

import logging
import time
from datetime import date, timedelta
from typing import Any

import requests

from etl.config import GITHUB_TOKEN
from .base import BaseCollector

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com"
REQUEST_DELAY_SECS = 0.3


class GitHubCollector(BaseCollector):
    """Collects GitHub repository metrics for AI models."""

    source_name: str = "github"

    def __init__(self, timeout: int = 15):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "AIViralityIndex/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
        else:
            self.logger.warning(
                "GITHUB_TOKEN not set — using unauthenticated requests (60/hour limit)"
            )
        self._session.headers.update(headers)

    def _get_repo_stats(self, repo_full_name: str) -> dict[str, Any] | None:
        """
        Fetch stats for a single GitHub repo.

        Args:
            repo_full_name: e.g. 'openai/openai-python'

        Returns:
            Dict with stars, forks, open_issues, watchers or None on failure.
        """
        url = f"{GITHUB_API_URL}/repos/{repo_full_name}"
        try:
            resp = self._session.get(url, timeout=self._timeout)

            if resp.status_code == 404:
                self.logger.warning(f"GitHub repo not found: {repo_full_name}")
                return None

            if resp.status_code == 403:
                remaining = resp.headers.get("X-RateLimit-Remaining", "?")
                self.logger.error(
                    f"GitHub rate limited (remaining: {remaining}): {repo_full_name}"
                )
                return None

            resp.raise_for_status()
            data = resp.json()

            return {
                "repo": repo_full_name,
                "stars": data.get("stargazers_count", 0),
                "forks": data.get("forks_count", 0),
                "open_issues": data.get("open_issues_count", 0),
                "watchers": data.get("subscribers_count", 0),
            }

        except requests.RequestException as e:
            self.logger.warning(f"GitHub API error for {repo_full_name}: {e}")
            return None

    def _get_yesterday_metrics(self, model_id: str) -> dict[str, float]:
        """
        Fetch yesterday's GitHub metrics from raw_metrics for delta calculation.

        Returns:
            Dict like {'total_stars': 12345, 'total_forks': 678} or empty dict.
        """
        from etl.storage.supabase_client import get_client

        yesterday = (date.today() - timedelta(days=1)).isoformat()
        client = get_client()

        result = (
            client.table("raw_metrics")
            .select("metric_name, metric_value")
            .eq("model_id", model_id)
            .eq("source", "github")
            .eq("date", yesterday)
            .in_("metric_name", ["total_stars", "total_forks"])
            .execute()
        )

        return {row["metric_name"]: float(row["metric_value"]) for row in result.data}

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch GitHub metrics for a model.

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of repo full names (e.g., ['openai/openai-python']).

        Returns:
            Result dict with metrics or None on complete failure.
        """
        if not aliases:
            self.logger.info(
                f"No GitHub repos for {model_slug}, returning zeros"
            )
            return self.make_result(
                model_slug=model_slug,
                metrics={
                    "total_stars": 0,
                    "total_forks": 0,
                    "total_open_issues": 0,
                    "stars_delta_1d": 0,
                    "forks_delta_1d": 0,
                },
            )

        self.logger.info(
            f"Fetching GitHub data for {model_slug} with {len(aliases)} repos"
        )

        total_stars = 0
        total_forks = 0
        total_open_issues = 0
        all_failed = True
        raw_repos: list[dict] = []

        for i, repo in enumerate(aliases):
            if i > 0:
                time.sleep(REQUEST_DELAY_SECS)

            stats = self._get_repo_stats(repo)
            if stats is not None:
                all_failed = False
                total_stars += stats["stars"]
                total_forks += stats["forks"]
                total_open_issues += stats["open_issues"]
                raw_repos.append(stats)

        if all_failed:
            self.logger.error(f"All GitHub fetches failed for {model_slug}")
            return None

        # Calculate deltas if we have yesterday's data
        stars_delta = 0
        forks_delta = 0
        try:
            from etl.storage.supabase_client import get_model_id as get_mid

            model_id = get_mid(model_slug)
            if model_id:
                yesterday = self._get_yesterday_metrics(model_id)
                if "total_stars" in yesterday:
                    stars_delta = total_stars - yesterday["total_stars"]
                if "total_forks" in yesterday:
                    forks_delta = total_forks - yesterday["total_forks"]
        except Exception as e:
            self.logger.warning(f"Could not compute deltas for {model_slug}: {e}")

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "total_stars": total_stars,
                "total_forks": total_forks,
                "total_open_issues": total_open_issues,
                "stars_delta_1d": stars_delta,
                "forks_delta_1d": forks_delta,
            },
        )
        result["raw_json"] = {
            "repos_queried": aliases,
            "repos_data": raw_repos,
        }

        self.logger.info(
            f"GitHub for {model_slug}: stars={total_stars}, "
            f"forks={total_forks}, issues={total_open_issues}, "
            f"Δstars={stars_delta}, Δforks={forks_delta}"
        )
        return result
