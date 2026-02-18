"""
YouTube collector — fetches video activity via YouTube Data API v3.

Uses the official YouTube Data API to find videos published in the last 24 hours
for each AI model, then collects view counts and engagement metrics.

Metrics collected:
- video_count_24h: number of videos published in last 24h matching model queries
- total_views_24h: total views across those videos
- avg_engagement: average (likes + comments) / views ratio

Quota strategy (10,000 units/day):
- search.list = 100 units each. We do 1 search per model (7 models = 700 units).
- videos.list = 1 unit per call (up to 50 video IDs per call).
  ~7 calls = 7 units.
- Total: ~707 units/run, well under 10,000 daily limit.
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from etl.config import YOUTUBE_API_KEY
from .base import BaseCollector

logger = logging.getLogger(__name__)

# Max results per search query (API max is 50)
MAX_RESULTS_PER_SEARCH = 50

# Delay between API calls to be respectful
REQUEST_DELAY_SECS = 0.5


class YouTubeCollector(BaseCollector):
    """Collects YouTube video activity for AI models."""

    source_name: str = "youtube"

    def __init__(self, max_results: int = MAX_RESULTS_PER_SEARCH):
        super().__init__()
        self._max_results = max_results
        self._youtube = None

    def _get_client(self):
        """Lazy-init the YouTube API client."""
        if self._youtube is None:
            if not YOUTUBE_API_KEY:
                raise RuntimeError("YOUTUBE_API_KEY is not set in .env")
            self._youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        return self._youtube

    def _search_videos(
        self,
        query: str,
        published_after: str,
    ) -> list[str]:
        """
        Search for videos matching query published after a given time.

        Args:
            query: Search query string (e.g., "ChatGPT | GPT-4o").
            published_after: ISO 8601 datetime string for publishedAfter filter.

        Returns:
            List of video IDs.
        """
        youtube = self._get_client()
        video_ids: list[str] = []

        try:
            request = youtube.search().list(
                q=query,
                type="video",
                part="id",
                publishedAfter=published_after,
                maxResults=self._max_results,
                order="viewCount",
                relevanceLanguage="en",
            )
            response = request.execute()

            for item in response.get("items", []):
                vid = item.get("id", {}).get("videoId")
                if vid:
                    video_ids.append(vid)

        except HttpError as e:
            if e.resp.status == 403:
                self.logger.error(f"YouTube API quota exceeded or forbidden: {e}")
            else:
                self.logger.error(f"YouTube search API error: {e}")
            raise

        return video_ids

    def _get_video_stats(self, video_ids: list[str]) -> list[dict[str, Any]]:
        """
        Get statistics for a batch of video IDs.

        Args:
            video_ids: List of YouTube video IDs (max 50 per call).

        Returns:
            List of dicts with view_count, like_count, comment_count.
        """
        if not video_ids:
            return []

        youtube = self._get_client()
        stats: list[dict[str, Any]] = []

        # videos.list accepts up to 50 IDs per request
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i + 50]
            try:
                request = youtube.videos().list(
                    part="statistics",
                    id=",".join(batch),
                )
                response = request.execute()

                for item in response.get("items", []):
                    s = item.get("statistics", {})
                    stats.append({
                        "video_id": item["id"],
                        "view_count": int(s.get("viewCount", 0)),
                        "like_count": int(s.get("likeCount", 0)),
                        "comment_count": int(s.get("commentCount", 0)),
                    })

            except HttpError as e:
                self.logger.warning(f"YouTube videos.list error: {e}")
                # Return what we have so far
                break

            if i + 50 < len(video_ids):
                time.sleep(REQUEST_DELAY_SECS)

        return stats

    def fetch(self, model_slug: str, aliases: list[str]) -> dict[str, Any] | None:
        """
        Fetch YouTube video activity for a model.

        Combines all aliases into a single OR query to minimize API calls
        (1 search.list = 100 quota units). Then fetches video stats (1 unit).

        Args:
            model_slug: Model identifier (e.g., 'chatgpt').
            aliases: List of search terms (e.g., ['ChatGPT', 'GPT-4o']).

        Returns:
            Result dict with metrics or None on complete failure.
        """
        if not aliases:
            self.logger.warning(f"No aliases for {model_slug}, skipping YouTube fetch")
            return None

        self.logger.info(
            f"Fetching YouTube data for {model_slug} with {len(aliases)} aliases"
        )

        # 24 hours ago in RFC 3339 format
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        published_after = since.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Combine aliases with pipe (|) for YouTube OR search
        # YouTube search treats | as OR in the query
        query = " | ".join(f'"{alias}"' for alias in aliases)

        try:
            # Step 1: Search for recent videos (100 quota units)
            video_ids = self._search_videos(query, published_after)
            self.logger.info(
                f"YouTube search for {model_slug}: found {len(video_ids)} videos"
            )

            if not video_ids:
                # No videos found — return zeros (valid result, not a failure)
                return self._make_youtube_result(model_slug, aliases, 0, 0, 0.0, [])

            time.sleep(REQUEST_DELAY_SECS)

            # Step 2: Get video statistics (1 quota unit per call)
            stats = self._get_video_stats(video_ids)

            # Step 3: Calculate aggregate metrics
            video_count = len(stats)
            total_views = sum(s["view_count"] for s in stats)
            total_engagement = sum(
                s["like_count"] + s["comment_count"] for s in stats
            )
            avg_engagement = (
                total_engagement / total_views if total_views > 0 else 0.0
            )

            return self._make_youtube_result(
                model_slug, aliases, video_count, total_views, avg_engagement, stats
            )

        except HttpError as e:
            if e.resp.status == 403:
                # Quota exceeded — return partial data if possible
                self.logger.error(
                    f"YouTube quota exceeded for {model_slug}. "
                    f"Returning None — will retry next run."
                )
                return None
            self.logger.error(f"YouTube API error for {model_slug}: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Unexpected error fetching YouTube for {model_slug}: {e}")
            return None

    def _make_youtube_result(
        self,
        model_slug: str,
        aliases: list[str],
        video_count: int,
        total_views: int,
        avg_engagement: float,
        stats: list[dict],
    ) -> dict[str, Any]:
        """Build the standardized result dict."""
        result = self.make_result(
            model_slug=model_slug,
            metrics={
                "video_count_24h": video_count,
                "total_views_24h": total_views,
                "avg_engagement": round(avg_engagement, 6),
            },
        )
        result["raw_json"] = {
            "aliases_queried": aliases,
            "query_combined": " | ".join(f'"{a}"' for a in aliases),
            "video_count": video_count,
            "top_videos": sorted(stats, key=lambda x: x["view_count"], reverse=True)[:5]
            if stats else [],
        }

        self.logger.info(
            f"YouTube for {model_slug}: videos={video_count}, "
            f"views={total_views}, engagement={avg_engagement:.4f}"
        )
        return result
