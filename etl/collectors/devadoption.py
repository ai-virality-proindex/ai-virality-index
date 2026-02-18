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
            # PyPI recent endpoint: {"data": {"last_day": 12345, ...}}
            return int(data.get("data", {}).get("last_day", 0))
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
