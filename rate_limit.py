import time
import asyncio
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status


class SlidingWindowRateLimiter:
    """
    Lightweight, thread-safe in-memory sliding window rate limiter.
    Does not require external Redis or dependencies.
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        # Key -> list of request timestamps
        self._records: Dict[str, List[float]] = defaultdict(list)

    async def check_rate_limit(
        self, key: str, max_requests: int, window_seconds: int = 60
    ) -> Tuple[bool, int]:
        """
        Check if `key` exceeds `max_requests` within `window_seconds`.
        Returns (is_allowed, retry_after_seconds).
        """
        now = time.time()
        cutoff = now - window_seconds

        async with self._lock:
            timestamps = self._records[key]
            # Prune timestamps older than cutoff
            self._records[key] = [t for t in timestamps if t > cutoff]

            if len(self._records[key]) >= max_requests:
                # Calculate oldest timestamp within window to determine retry-after
                oldest = self._records[key][0]
                retry_after = max(1, int(oldest + window_seconds - now))
                return False, retry_after

            self._records[key].append(now)
            return True, 0


# Global shared rate limiter instance
limiter = SlidingWindowRateLimiter()


def rate_limit(max_requests: int = 10, window_seconds: int = 60, by_ip: bool = False):
    """
    FastAPI dependency to rate limit endpoints.
    Can rate limit by client IP or authenticated user ID.
    """
    async def dependency(request: Request):
        if by_ip:
            client_ip = request.client.host if request.client else "unknown"
            key = f"ip:{client_ip}:{request.url.path}"
        else:
            # Try to get user identifier or fallback to IP
            auth_header = request.headers.get("Authorization", "")
            cookie_token = request.cookies.get("access_token", "")
            key_id = auth_header or cookie_token or (request.client.host if request.client else "anon")
            key = f"user:{key_id}:{request.url.path}"

        allowed, retry_after = await limiter.check_rate_limit(
            key, max_requests=max_requests, window_seconds=window_seconds
        )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
