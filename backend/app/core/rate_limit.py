import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict


class FailureRateLimiter:
    """
    In-memory sliding-window limiter for failed attempts (e.g. logins).
    Per-process only: fine for a single web worker; use Redis if you scale out.
    """

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> Deque[float]:
        events = self._events[key]
        while events and now - events[0] > self.window_seconds:
            events.popleft()
        return events

    def retry_after(self, key: str) -> int:
        """Seconds until the key may try again (0 when not blocked)."""
        now = time.time()
        with self._lock:
            events = self._prune(key, now)
            if len(events) < self.max_failures:
                return 0
            return max(1, int(self.window_seconds - (now - events[0])))

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._prune(key, time.time()).append(time.time())

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


# 10 bad passwords per (ip, email) and 50 per ip within 15 minutes
login_account_limiter = FailureRateLimiter(max_failures=10, window_seconds=900)
login_ip_limiter = FailureRateLimiter(max_failures=50, window_seconds=900)
