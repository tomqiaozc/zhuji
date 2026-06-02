"""In-process failed-login throttle for /api/auth/login.

We track failed attempts per IP and per username in two parallel sliding
windows. A single shared process-wide store is sufficient for the single-
worker FastAPI deployment we run today. If we ever shard the API behind
multiple Gunicorn workers we'll need to swap this for Redis — at that
point the public surface (the FastAPI dependency) stays the same.

Why both IP and username:
- IP-only lets one attacker rotate target usernames behind a single IP.
- Username-only lets a botnet hammer one account from many IPs.
- Tracking both blocks both shapes without needing distributed state.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

from fastapi import HTTPException, Request, status

# Window: 15 minutes. Cap: 10 failed attempts per IP, 5 per username.
# Tuned for "a frustrated human typo'd their own password" rather than
# "an attacker is probing credentials" — humans rarely fat-finger 5
# times in a row, attackers easily do 100.
WINDOW_SECONDS = 15 * 60
IP_LIMIT = 10
USERNAME_LIMIT = 5

_attempts_by_ip: dict[str, deque[float]] = {}
_attempts_by_username: dict[str, deque[float]] = {}
_lock = Lock()


def _client_ip(request: Request) -> str:
    """Best-effort client IP — trusts the first X-Forwarded-For hop
    when we are behind nginx in prod, falls back to the socket addr."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",", 1)[0].strip() or "unknown"
    if request.client is not None:
        return request.client.host or "unknown"
    return "unknown"


def _prune(bucket: deque[float], now: float) -> None:
    cutoff = now - WINDOW_SECONDS
    while bucket and bucket[0] < cutoff:
        bucket.popleft()


def check_login_rate_limit(request: Request, username: str) -> None:
    """Raise 429 if either the IP or the username is over its budget.

    Called BEFORE we hit the database so a flood of failed attempts
    doesn't also DoS Postgres with bcrypt verifies.
    """
    now = time.monotonic()
    ip = _client_ip(request)
    key_user = (username or "").strip().lower()
    with _lock:
        ip_bucket = _attempts_by_ip.setdefault(ip, deque())
        _prune(ip_bucket, now)
        if len(ip_bucket) >= IP_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="登录失败次数过多，请稍后再试",
                headers={"Retry-After": str(WINDOW_SECONDS)},
            )
        if key_user:
            user_bucket = _attempts_by_username.setdefault(key_user, deque())
            _prune(user_bucket, now)
            if len(user_bucket) >= USERNAME_LIMIT:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="该账号登录失败次数过多，请稍后再试",
                    headers={"Retry-After": str(WINDOW_SECONDS)},
                )


def record_login_failure(request: Request, username: str) -> None:
    """Append a failure to both buckets after a wrong password."""
    now = time.monotonic()
    ip = _client_ip(request)
    key_user = (username or "").strip().lower()
    with _lock:
        _attempts_by_ip.setdefault(ip, deque()).append(now)
        if key_user:
            _attempts_by_username.setdefault(key_user, deque()).append(now)


def reset_login_throttle() -> None:
    """Test helper — wipe both buckets. Not exposed to the app."""
    with _lock:
        _attempts_by_ip.clear()
        _attempts_by_username.clear()
