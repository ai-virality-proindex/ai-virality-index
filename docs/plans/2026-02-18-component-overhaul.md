# Component Overhaul: Q→D, GitHub Fix, Trends Cache, Weight Rebalance

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static Elo (Q) with daily-changing Developer Adoption (D = npm+PyPI downloads), fix GitHub delta bug, add Trends Redis cache, rebalance weights.

**Architecture:** The index keeps 6 components (T/S/G/N/D/M). Q is removed from the formula but Arena collector stays as metadata-only. New DevAdoptionCollector fetches npm+PyPI download counts. GitHub delta query is fixed to use most-recent-previous-date. Trends gets Redis cache to survive 429s.

**Tech Stack:** Python 3.11, requests, Upstash Redis (already configured), Supabase, Next.js 14/TypeScript.

**Python:** `C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe`
**Project root:** `E:\2026\AI Virality Index\ai-virality-index\`

---

## Task 1: Fix GitHub delta bug

**Files:**
- Modify: `etl/collectors/github_collector.py:93-115`
- Test: `etl/tests/test_github_delta.py` (create)

**Step 1: Write the failing test**

```python
# etl/tests/test_github_delta.py
"""Tests for GitHub delta calculation fix."""
import unittest
from unittest.mock import patch, MagicMock
from datetime import date


class TestGitHubDeltaQuery(unittest.TestCase):
    """Verify delta uses most-recent previous date, not exactly yesterday."""

    @patch("etl.collectors.github_collector.get_client")
    def test_get_previous_metrics_queries_most_recent(self, mock_get_client):
        """Delta should query lt(today) + order desc + limit 1, not eq(yesterday)."""
        from etl.collectors.github_collector import GitHubCollector

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lt.return_value = mock_table
        mock_table.in_.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.limit.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[
            {"metric_name": "total_stars", "metric_value": 1000.0},
            {"metric_name": "total_forks", "metric_value": 200.0},
        ])
        mock_get_client.return_value = mock_client

        collector = GitHubCollector()
        result = collector._get_previous_metrics("test-model-id")

        # Must use lt (less than today), NOT eq (exactly yesterday)
        mock_table.lt.assert_called_once()
        mock_table.order.assert_called_once()
        mock_table.limit.assert_called_once_with(2)  # 2 metrics per date

        self.assertEqual(result["total_stars"], 1000.0)
        self.assertEqual(result["total_forks"], 200.0)

    @patch("etl.collectors.github_collector.get_client")
    def test_get_previous_metrics_empty_returns_empty_dict(self, mock_get_client):
        """No previous data should return empty dict."""
        from etl.collectors.github_collector import GitHubCollector

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.lt.return_value = mock_table
        mock_table.in_.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.limit.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])
        mock_get_client.return_value = mock_client

        collector = GitHubCollector()
        result = collector._get_previous_metrics("test-model-id")

        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_github_delta.py -v`
Expected: FAIL — `_get_previous_metrics` does not exist (method is `_get_yesterday_metrics`)

**Step 3: Fix the implementation**

In `etl/collectors/github_collector.py`, rename `_get_yesterday_metrics` to `_get_previous_metrics` and change the query:

```python
    def _get_previous_metrics(self, model_id: str) -> dict[str, float]:
        """
        Fetch the most recent previous GitHub metrics from raw_metrics for delta calculation.
        Uses lt(today) + order desc instead of eq(yesterday) to handle gaps.

        Returns:
            Dict like {'total_stars': 12345, 'total_forks': 678} or empty dict.
        """
        from etl.storage.supabase_client import get_client

        today = date.today().isoformat()
        client = get_client()

        result = (
            client.table("raw_metrics")
            .select("metric_name, metric_value")
            .eq("model_id", model_id)
            .eq("source", "github")
            .lt("date", today)
            .in_("metric_name", ["total_stars", "total_forks"])
            .order("date", desc=True)
            .limit(2)  # 2 metrics (stars + forks) from the most recent date
        )
        result = result.execute()

        return {row["metric_name"]: float(row["metric_value"]) for row in result.data}
```

Also update the call site on line 177 from `self._get_yesterday_metrics(model_id)` to `self._get_previous_metrics(model_id)` and rename `yesterday` variable to `previous`:

```python
        # Calculate deltas if we have previous data
        stars_delta = 0
        forks_delta = 0
        try:
            from etl.storage.supabase_client import get_model_id as get_mid

            model_id = get_mid(model_slug)
            if model_id:
                previous = self._get_previous_metrics(model_id)
                if "total_stars" in previous:
                    stars_delta = total_stars - previous["total_stars"]
                if "total_forks" in previous:
                    forks_delta = total_forks - previous["total_forks"]
        except Exception as e:
            self.logger.warning(f"Could not compute deltas for {model_slug}: {e}")
```

**Step 4: Run tests to verify they pass**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_github_delta.py -v`
Expected: 2 passed

**Step 5: Commit**

```bash
git add etl/collectors/github_collector.py etl/tests/test_github_delta.py
git commit -m "fix: GitHub delta uses most-recent previous date instead of exactly yesterday"
```

---

## Task 2: Update weights — replace Q with D in config.py

**Files:**
- Modify: `etl/config.py:39-55`
- Modify: `etl/tests/test_index_calculator.py:40-53`

**Step 1: Update weights in config.py**

Replace the weight dicts:

```python
# --- Index Weights ---
WEIGHTS_TRADE = {
    "T": 0.18,  # Trends (search interest)
    "S": 0.28,  # Social (YouTube + HackerNews)
    "G": 0.15,  # GitHub (star/fork velocity)
    "N": 0.12,  # News (GDELT mentions)
    "D": 0.15,  # Dev Adoption (npm + PyPI downloads)
    "M": 0.12,  # Mindshare (Wikipedia pageviews)
}

WEIGHTS_CONTENT = {
    "T": 0.25,  # Trends
    "S": 0.35,  # Social (YouTube + HackerNews)
    "G": 0.05,  # GitHub
    "N": 0.20,  # News
    "D": 0.05,  # Dev Adoption
    "M": 0.10,  # Mindshare (Wikipedia pageviews)
}
```

**Step 2: Update tests in test_index_calculator.py**

Update `TestWeightConfiguration` class — change expected values and component set from `{T,S,G,N,Q,M}` to `{T,S,G,N,D,M}`:

```python
    def test_trade_weights_match_spec(self):
        expected = {"T": 0.18, "S": 0.28, "G": 0.15, "N": 0.12, "D": 0.15, "M": 0.12}
        for k, v in expected.items():
            self.assertAlmostEqual(WEIGHTS_TRADE[k], v, places=9, msg=f"Weight {k}")

    def test_content_weights_match_spec(self):
        expected = {"T": 0.25, "S": 0.35, "G": 0.05, "N": 0.20, "D": 0.05, "M": 0.10}
        for k, v in expected.items():
            self.assertAlmostEqual(WEIGHTS_CONTENT[k], v, places=9, msg=f"Weight {k}")

    def test_all_six_components_present(self):
        components = {"T", "S", "G", "N", "D", "M"}
        self.assertEqual(set(WEIGHTS_TRADE.keys()), components)
        self.assertEqual(set(WEIGHTS_CONTENT.keys()), components)
```

**Step 3: Run tests**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_index_calculator.py::TestWeightConfiguration -v`
Expected: 6 passed

**Step 4: Commit**

```bash
git add etl/config.py etl/tests/test_index_calculator.py
git commit -m "feat: rebalance weights — replace Q(Elo) with D(DevAdoption)"
```

---

## Task 3: Build DevAdoption collector (npm + PyPI)

**Files:**
- Create: `etl/collectors/devadoption.py`
- Create: `etl/tests/test_devadoption.py`

**Step 1: Write the failing test**

```python
# etl/tests/test_devadoption.py
"""Tests for DevAdoptionCollector (npm + PyPI downloads)."""
import unittest
from unittest.mock import patch, MagicMock
from datetime import date


class TestDevAdoptionCollector(unittest.TestCase):
    """Test npm + PyPI download fetching."""

    @patch("etl.collectors.devadoption.requests.Session")
    def test_fetch_npm_downloads(self, mock_session_cls):
        """Should fetch daily downloads from npm registry API."""
        from etl.collectors.devadoption import DevAdoptionCollector

        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        # Mock npm response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"downloads": 150000, "package": "openai"}
        mock_session.get.return_value = mock_resp

        collector = DevAdoptionCollector()
        downloads = collector._fetch_npm_downloads("openai")

        self.assertEqual(downloads, 150000)

    @patch("etl.collectors.devadoption.requests.Session")
    def test_fetch_pypi_downloads(self, mock_session_cls):
        """Should fetch recent downloads from PyPI stats API."""
        from etl.collectors.devadoption import DevAdoptionCollector

        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": {"last_day": {"downloads": 80000}},
            "package": "openai",
            "type": "recent_downloads",
        }
        mock_session.get.return_value = mock_resp

        collector = DevAdoptionCollector()
        downloads = collector._fetch_pypi_downloads("openai")

        self.assertEqual(downloads, 80000)

    @patch("etl.collectors.devadoption.requests.Session")
    def test_fetch_returns_combined_downloads(self, mock_session_cls):
        """Full fetch should sum npm + PyPI downloads."""
        from etl.collectors.devadoption import DevAdoptionCollector

        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        def side_effect(url, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if "npmjs" in url:
                resp.json.return_value = {"downloads": 100000}
            elif "pypistats" in url:
                resp.json.return_value = {
                    "data": {"last_day": {"downloads": 50000}},
                    "type": "recent_downloads",
                }
            return resp

        mock_session.get.side_effect = side_effect

        collector = DevAdoptionCollector()
        result = collector.fetch("chatgpt", ["npm:openai", "pypi:openai"])

        self.assertIsNotNone(result)
        self.assertEqual(result["source"], "devadoption")
        self.assertEqual(result["metrics"]["downloads_daily"], 150000)

    def test_fetch_no_aliases_returns_zeros(self):
        """Model with no packages should return zero downloads."""
        from etl.collectors.devadoption import DevAdoptionCollector

        collector = DevAdoptionCollector()
        result = collector.fetch("grok", [])

        self.assertIsNotNone(result)
        self.assertEqual(result["metrics"]["downloads_daily"], 0)

    @patch("etl.collectors.devadoption.requests.Session")
    def test_fetch_api_failure_returns_zero_for_that_package(self, mock_session_cls):
        """If one API fails, it should contribute 0 not crash."""
        from etl.collectors.devadoption import DevAdoptionCollector

        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_session.get.return_value = mock_resp

        collector = DevAdoptionCollector()
        downloads = collector._fetch_npm_downloads("nonexistent-pkg")

        self.assertEqual(downloads, 0)


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_devadoption.py -v`
Expected: FAIL — module not found

**Step 3: Write the collector**

```python
# etl/collectors/devadoption.py
"""
Developer Adoption collector — fetches daily download counts from npm and PyPI.

Replaces the Arena Elo (Q) component with a daily-changing signal that measures
how many developers are installing each model's SDK.

Sources:
- npm Registry API: https://api.npmjs.org/downloads/point/last-day/{package}
- PyPI Stats API: https://pypistats.org/api/packages/{package}/recent

No authentication required for either API. No enforced rate limits.

Alias format in model_aliases: "npm:{package}" or "pypi:{package}"
  e.g., "npm:openai", "pypi:openai", "npm:@anthropic-ai/sdk"

Metrics collected:
- downloads_daily: Total downloads across all npm + PyPI packages (last day)
- downloads_npm: npm-only total
- downloads_pypi: PyPI-only total
"""

import logging
import time
from typing import Any

import requests

from .base import BaseCollector

logger = logging.getLogger(__name__)

NPM_API_URL = "https://api.npmjs.org/downloads/point/last-day"
PYPI_API_URL = "https://pypistats.org/api/packages"
REQUEST_DELAY_SECS = 0.5


class DevAdoptionCollector(BaseCollector):
    """Collects npm + PyPI download counts for AI model SDKs."""

    source_name: str = "devadoption"

    def __init__(self, timeout: int = 15):
        super().__init__()
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "AIViralityIndex/1.0",
            "Accept": "application/json",
        })

    def _fetch_npm_downloads(self, package: str) -> int:
        """
        Fetch last-day download count for an npm package.

        Args:
            package: npm package name (e.g., 'openai', '@anthropic-ai/sdk')

        Returns:
            Download count (int), or 0 on failure.
        """
        url = f"{NPM_API_URL}/{package}"
        try:
            resp = self._session.get(url, timeout=self._timeout)
            if resp.status_code != 200:
                self.logger.warning(f"npm API returned {resp.status_code} for '{package}'")
                return 0
            data = resp.json()
            return int(data.get("downloads", 0))
        except Exception as e:
            self.logger.warning(f"npm API error for '{package}': {e}")
            return 0

    def _fetch_pypi_downloads(self, package: str) -> int:
        """
        Fetch last-day download count for a PyPI package.

        Args:
            package: PyPI package name (e.g., 'openai', 'anthropic')

        Returns:
            Download count (int), or 0 on failure.
        """
        url = f"{PYPI_API_URL}/{package}/recent"
        try:
            resp = self._session.get(url, timeout=self._timeout)
            if resp.status_code != 200:
                self.logger.warning(f"PyPI stats API returned {resp.status_code} for '{package}'")
                return 0
            data = resp.json()
            return int(data.get("data", {}).get("last_day", {}).get("downloads", 0))
        except Exception as e:
            self.logger.warning(f"PyPI stats API error for '{package}': {e}")
            return 0

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch npm + PyPI downloads for a model.

        Aliases should be prefixed: "npm:openai", "pypi:openai".

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of "npm:{pkg}" and "pypi:{pkg}" strings.

        Returns:
            Result dict with metrics: {downloads_daily, downloads_npm, downloads_pypi}
        """
        if not aliases:
            self.logger.info(f"No dev adoption packages for {model_slug}, returning zeros")
            return self.make_result(
                model_slug=model_slug,
                metrics={
                    "downloads_daily": 0,
                    "downloads_npm": 0,
                    "downloads_pypi": 0,
                },
            )

        self.logger.info(
            f"Fetching dev adoption for {model_slug} with {len(aliases)} packages"
        )

        total_npm = 0
        total_pypi = 0
        raw_packages: list[dict] = []

        for i, alias in enumerate(aliases):
            if i > 0:
                time.sleep(REQUEST_DELAY_SECS)

            if alias.startswith("npm:"):
                package = alias[4:]  # strip "npm:" prefix
                count = self._fetch_npm_downloads(package)
                total_npm += count
                raw_packages.append({"source": "npm", "package": package, "downloads": count})
            elif alias.startswith("pypi:"):
                package = alias[5:]  # strip "pypi:" prefix
                count = self._fetch_pypi_downloads(package)
                total_pypi += count
                raw_packages.append({"source": "pypi", "package": package, "downloads": count})
            else:
                self.logger.warning(
                    f"Unknown alias format '{alias}' for {model_slug}. "
                    f"Expected 'npm:pkg' or 'pypi:pkg'"
                )

        total = total_npm + total_pypi

        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "downloads_daily": total,
                "downloads_npm": total_npm,
                "downloads_pypi": total_pypi,
            },
        )
        result["raw_json"] = {
            "packages_queried": aliases,
            "packages_data": raw_packages,
        }

        self.logger.info(
            f"DevAdoption for {model_slug}: "
            f"total={total:,} (npm={total_npm:,}, pypi={total_pypi:,})"
        )
        return result
```

**Step 4: Run tests**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_devadoption.py -v`
Expected: 5 passed

**Step 5: Commit**

```bash
git add etl/collectors/devadoption.py etl/tests/test_devadoption.py
git commit -m "feat: add DevAdoption collector (npm + PyPI daily downloads)"
```

---

## Task 4: Add package aliases to models_config.yaml

**Files:**
- Modify: `etl/models_config.yaml`

**Step 1: Add `devadoption_packages` to each model**

Add a new field to each model in models_config.yaml:

```yaml
  chatgpt:
    # ... existing fields ...
    devadoption_packages:
      - "npm:openai"
      - "pypi:openai"

  gemini:
    # ... existing fields ...
    devadoption_packages:
      - "npm:@google/generative-ai"
      - "pypi:google-generativeai"

  claude:
    # ... existing fields ...
    devadoption_packages:
      - "npm:@anthropic-ai/sdk"
      - "pypi:anthropic"

  perplexity:
    # ... existing fields ...
    devadoption_packages: []

  deepseek:
    # ... existing fields ...
    devadoption_packages:
      - "pypi:deepseek-ai"

  grok:
    # ... existing fields ...
    devadoption_packages: []

  copilot:
    # ... existing fields ...
    devadoption_packages: []
```

**Step 2: Create seed script and run it**

Create `etl/seed_devadoption_aliases.py`:

```python
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
```

**Step 3: Run seed script**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m etl.seed_devadoption_aliases`
Expected: 7 aliases inserted (2+2+2+0+1+0+0)

**Step 4: Commit**

```bash
git add etl/models_config.yaml etl/seed_devadoption_aliases.py
git commit -m "feat: add devadoption package aliases for npm/PyPI"
```

---

## Task 5: Register devadoption in main.py + update index_calculator.py

**Files:**
- Modify: `etl/main.py:29-52`
- Modify: `etl/processing/index_calculator.py:1-53, 133, 165, 341, 380`

**Step 1: Add import and registry entry in main.py**

Add import at line ~36:
```python
from etl.collectors.devadoption import DevAdoptionCollector
```

Add to COLLECTOR_REGISTRY dict:
```python
    "devadoption": (DevAdoptionCollector, "devadoption_package"),
```

**Step 2: Update index_calculator.py**

Replace all `Q` references with `D`:

Update docstring (lines 14-19):
```python
#     D: source='devadoption', 'downloads_daily'  (was Q: arena/elo_rating)
```

Update `COMPONENT_SOURCES` dict (lines 46-53):
```python
COMPONENT_SOURCES = {
    "T": [("trends", "interest")],
    "S": [("youtube", "total_views_24h"), ("hackernews", "stories_24h")],
    "G": [("github", "stars_delta_1d"), ("github", "forks_delta_1d")],
    "N": [("gdelt", "article_count")],
    "D": [("devadoption", "downloads_daily")],
    "M": [("wikipedia", "pageviews_7d")],
}
```

Replace ALL occurrences of the component list `["T", "S", "G", "N", "Q", "M"]` with `["T", "S", "G", "N", "D", "M"]`. There are 4 occurrences:
- Line 133 in `calculate_index`
- Line 165 in `calculate_index` (weighted sum)
- Line 341 in `run_daily_calculation` (component_scores upsert)
- Line 380 in `run_daily_calculation` (breakdown dict)

**Step 3: Run all existing tests**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/ -v`
Expected: All pass (including updated weight tests from Task 2)

**Step 4: Commit**

```bash
git add etl/main.py etl/processing/index_calculator.py
git commit -m "feat: register DevAdoption collector, replace Q with D in index formula"
```

---

## Task 6: Add Trends Redis caching

**Files:**
- Modify: `etl/collectors/trends.py`
- Create: `etl/tests/test_trends_cache.py`

**Step 1: Write failing test**

```python
# etl/tests/test_trends_cache.py
"""Tests for Trends Redis caching."""
import unittest
from unittest.mock import patch, MagicMock


class TestTrendsRedisCache(unittest.TestCase):
    """Verify cache-on-success and cache-read-on-failure."""

    @patch("etl.collectors.trends.redis_get")
    @patch("etl.collectors.trends.redis_set")
    def test_successful_fetch_caches_result(self, mock_set, mock_get):
        """On success, result should be cached in Redis."""
        from etl.collectors.trends import TrendsCollector

        collector = TrendsCollector()

        # Simulate a successful pytrends fetch
        metrics = {"interest": 75.0, "interest_7d_avg": 68.1}
        cache_key = "trends:chatgpt"

        collector._cache_trends_result("chatgpt", metrics)

        mock_set.assert_called_once()
        args = mock_set.call_args
        self.assertIn("chatgpt", args[0][0])

    @patch("etl.collectors.trends.redis_get")
    def test_cache_miss_returns_none(self, mock_get):
        """Cache miss should return None."""
        from etl.collectors.trends import TrendsCollector

        mock_get.return_value = None

        collector = TrendsCollector()
        result = collector._get_cached_trends("chatgpt")

        self.assertIsNone(result)

    @patch("etl.collectors.trends.redis_get")
    def test_cache_hit_returns_metrics(self, mock_get):
        """Cache hit should return stored metrics dict."""
        import json
        from etl.collectors.trends import TrendsCollector

        mock_get.return_value = json.dumps({"interest": 75.0, "interest_7d_avg": 68.1})

        collector = TrendsCollector()
        result = collector._get_cached_trends("chatgpt")

        self.assertEqual(result["interest"], 75.0)
        self.assertEqual(result["interest_7d_avg"], 68.1)


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Add Redis cache helpers to trends.py**

Add imports at top of `trends.py`:
```python
import json
```

Add cache helper functions (module-level, after constants):

```python
# Redis cache TTL for trends data (24 hours)
TRENDS_CACHE_TTL_SECS = 86400

def redis_set(key: str, value: str, ttl: int = TRENDS_CACHE_TTL_SECS) -> None:
    """Set a value in Upstash Redis with TTL. Fails silently."""
    try:
        from etl.config import UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
        if not UPSTASH_REDIS_URL or not UPSTASH_REDIS_TOKEN:
            return
        import requests as _req
        _req.post(
            f"{UPSTASH_REDIS_URL}/set/{key}",
            headers={"Authorization": f"Bearer {UPSTASH_REDIS_TOKEN}"},
            json={"value": value, "EX": ttl},
            timeout=5,
        )
    except Exception as e:
        logger.debug(f"Redis set failed: {e}")

def redis_get(key: str) -> str | None:
    """Get a value from Upstash Redis. Returns None on miss or failure."""
    try:
        from etl.config import UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
        if not UPSTASH_REDIS_URL or not UPSTASH_REDIS_TOKEN:
            return None
        import requests as _req
        resp = _req.get(
            f"{UPSTASH_REDIS_URL}/get/{key}",
            headers={"Authorization": f"Bearer {UPSTASH_REDIS_TOKEN}"},
            timeout=5,
        )
        data = resp.json()
        result = data.get("result")
        return result if result is not None else None
    except Exception as e:
        logger.debug(f"Redis get failed: {e}")
        return None
```

Add methods to TrendsCollector class:

```python
    def _cache_trends_result(self, model_slug: str, metrics: dict) -> None:
        """Cache successful trends result in Redis (24h TTL)."""
        key = f"trends:{model_slug}"
        redis_set(key, json.dumps(metrics))
        self.logger.debug(f"Cached trends for {model_slug}")

    def _get_cached_trends(self, model_slug: str) -> dict | None:
        """Retrieve cached trends result from Redis."""
        key = f"trends:{model_slug}"
        cached = redis_get(key)
        if cached:
            self.logger.info(f"Using cached trends for {model_slug}")
            return json.loads(cached)
        return None
```

Then modify the `fetch` method to:
1. On successful fetch: call `self._cache_trends_result(model_slug, metrics)`
2. After all sources fail (pytrends + trendspy both fail): try `self._get_cached_trends(model_slug)` before returning None

At end of successful pytrends section (after line 244):
```python
        # Cache successful result
        self._cache_trends_result(model_slug, result["metrics"])
```

At end of successful trendspy section (after line 207):
```python
                # Cache trendspy result too
                self._cache_trends_result(model_slug, trendspy_data)
```

Before final `return None` (around line 219), add:
```python
            # Last resort: try Redis cache
            cached = self._get_cached_trends(model_slug)
            if cached:
                result = self.make_result(model_slug=model_slug, metrics=cached)
                result["raw_json"] = {"source": "redis_cache", "stale": True}
                return result
```

**Step 3: Run tests**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/test_trends_cache.py -v`
Expected: 3 passed

**Step 4: Commit**

```bash
git add etl/collectors/trends.py etl/tests/test_trends_cache.py
git commit -m "feat: add Redis cache for Trends (24h TTL, 429 fallback)"
```

---

## Task 7: Update frontend — D replaces Q

**Files:**
- Modify: `web/src/components/BreakdownRadar.tsx:28-53`
- Modify: `web/src/app/models/[slug]/page.tsx:119-126`
- Modify: `web/src/app/page.tsx:358-365`
- Modify: `web/src/app/api/v1/breakdown/route.ts:90-97`
- Modify: `web/src/app/docs/page.tsx:464`

**Step 1: Update BreakdownRadar.tsx**

Replace Q entries with D in all three dicts:

```typescript
const COMPONENT_LABELS: Record<string, string> = {
  T: 'Search',
  S: 'Social',
  G: 'GitHub',
  N: 'News',
  D: 'Dev Adoption',
  M: 'Mindshare',
}

const COMPONENT_COLORS: Record<string, string> = {
  T: '#10B981',
  S: '#3B82F6',
  G: '#8B5CF6',
  N: '#F59E0B',
  D: '#EC4899',
  M: '#EF4444',
}

const COMPONENT_HINTS: Record<string, { source: string; desc: string }> = {
  T: { source: 'Google Trends', desc: 'How often people search for this model on Google' },
  S: { source: 'YouTube + HackerNews', desc: 'Video views, uploads, and developer community buzz' },
  G: { source: 'GitHub API', desc: 'New stars and forks on open-source repositories' },
  N: { source: 'GDELT', desc: 'How many news articles mention this model worldwide' },
  D: { source: 'npm + PyPI', desc: 'How many developers download this model\'s SDK each day' },
  M: { source: 'Wikipedia', desc: 'How many people read the Wikipedia page about this model' },
}
```

**Step 2: Update model detail page labels**

In `web/src/app/models/[slug]/page.tsx` line 119-126:

```typescript
  const LABELS: Record<string, string> = {
    T: 'Search Interest',
    S: 'Social Buzz',
    G: 'GitHub Activity',
    N: 'News Coverage',
    D: 'Dev Adoption',
    M: 'Mindshare',
  }
```

**Step 3: Update landing page component cards**

In `web/src/app/page.tsx` around line 358-365, replace the Q and M entries:

```typescript
              { code: 'D', name: 'Dev Adoption', desc: 'npm and PyPI SDK download velocity', color: '#EC4899' },
              { code: 'M', name: 'Mindshare', desc: 'Wikipedia pageview volume measuring public interest', color: '#EF4444' },
```

**Step 4: Update API breakdown labels**

In `web/src/app/api/v1/breakdown/route.ts` line 90-97:

```typescript
    const componentLabels: Record<string, string> = {
      T: 'Trends (Search Interest)',
      S: 'Social (YouTube + Discussion)',
      G: 'GitHub (Star/Fork Velocity)',
      N: 'News (GDELT Media)',
      D: 'Dev Adoption (npm + PyPI)',
      M: 'Mindshare (Wikipedia Pageviews)',
    }
```

**Step 5: Update docs page example**

In `web/src/app/docs/page.tsx` line 464:

```json
      { "component": "D", "label": "Dev Adoption","normalized": 0.94, "smoothed": 0.94 },
```

**Step 6: Build and verify**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index\web" && npm run build`
Expected: Build succeeds with no errors

**Step 7: Commit**

```bash
git add web/src/components/BreakdownRadar.tsx web/src/app/models/[slug]/page.tsx web/src/app/page.tsx web/src/app/api/v1/breakdown/route.ts web/src/app/docs/page.tsx
git commit -m "feat: update frontend — D(Dev Adoption) replaces Q(Elo) in all components"
```

---

## Task 8: Keep Arena as metadata-only + cleanup

**Files:**
- Modify: `etl/main.py` (keep arena in registry but note it's metadata-only)
- Delete: `etl/collectors/market.py` (dead Polymarket code)

**Step 1: Add comment in main.py**

Above the `"arena"` entry in `COLLECTOR_REGISTRY`, add a comment:

```python
    # arena: kept for metadata (Elo badge) but NOT in index formula (removed in favor of D)
    "arena":      (QualityCollector,      "arena_name"),
```

**Step 2: Delete market.py**

```bash
git rm etl/collectors/market.py
```

(If file exists. If not, skip.)

**Step 3: Commit**

```bash
git add etl/main.py
git commit -m "chore: mark arena as metadata-only, remove dead Polymarket collector"
```

---

## Task 9: Run full test suite + build

**Step 1: Run all ETL tests**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m pytest etl/tests/ -v --tb=short`
Expected: All tests pass (original 129 + new tests)

**Step 2: Build frontend**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index\web" && npm run build`
Expected: Build succeeds

**Step 3: Run seed script (if not done in Task 4)**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m etl.seed_devadoption_aliases`
Expected: aliases inserted

**Step 4: Test ETL dry-run with devadoption**

Run: `cd "E:\2026\AI Virality Index\ai-virality-index" && "C:/Users/Alexe/AppData/Local/Programs/Python/Python311/python.exe" -m etl.main --source devadoption --model chatgpt --dry-run`
Expected: Shows download counts for chatgpt (npm:openai + pypi:openai)

**Step 5: Final commit with all remaining changes**

```bash
git add -A
git status
git commit -m "feat: component overhaul — Q→D, GitHub fix, Trends cache, weight rebalance"
```

---

## Task 10: Update project docs

**Files:**
- Modify: `docs/PROMPTS_AND_CHECKLIST.md`
- Modify: `docs/roadmap.html`
- Modify: `docs/TECHNICAL_SPEC.md` (update formula section)

Update session log, roadmap progress bar, and TECHNICAL_SPEC formula section to reflect:
- New components: T, S, G, N, D, M
- New weights: Trading 0.18/0.28/0.15/0.12/0.15/0.12, Content 0.25/0.35/0.05/0.20/0.05/0.10
- D = Developer Adoption (npm + PyPI daily downloads)
- Q = Arena Elo (metadata only, not in formula)
