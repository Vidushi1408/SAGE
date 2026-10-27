from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time as a naive datetime, matching the naive DateTime columns in the database."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
