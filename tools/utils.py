"""
tools/utils.py — Shared utilities for the AI News Dashboard scraper pipeline.
Deterministic, atomic, testable. No LLM calls here.
"""
import hashlib
import json
import os
from datetime import datetime, timezone, timedelta

CACHE_PATH = os.path.join('/tmp', 'articles_cache.json')


def generate_id(title: str, source: str) -> str:
    """Generate a stable sha256 ID from title + source."""
    raw = f"{title.strip().lower()}|{source.strip().lower()}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_to_utc(dt) -> datetime | None:
    """Normalize various datetime inputs to UTC-aware datetime."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    if isinstance(dt, str):
        for fmt in ('%a, %d %b %Y %H:%M:%S %z', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%SZ'):
            try:
                return datetime.strptime(dt, fmt).astimezone(timezone.utc)
            except ValueError:
                continue
    return None


def filter_last_24h(articles: list[dict]) -> list[dict]:
    """Remove articles older than 24 hours."""
    cutoff = now_utc() - timedelta(hours=24)
    result = []
    for a in articles:
        pub = parse_to_utc(a.get('published_at'))
        if pub is None or pub >= cutoff:
            result.append(a)
    return result


def deduplicate(articles: list[dict]) -> list[dict]:
    """Drop articles with duplicate IDs, keeping first occurrence."""
    seen = set()
    result = []
    for a in articles:
        if a['id'] not in seen:
            seen.add(a['id'])
            result.append(a)
    return result


def save_to_cache(payload: dict) -> None:
    """Write the full payload dict to .tmp/articles_cache.json."""
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)


def load_cache() -> dict | None:
    """Load cache from disk. Returns None if file doesn't exist."""
    if not os.path.exists(CACHE_PATH):
        return None
    with open(CACHE_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def is_cache_fresh(payload: dict, max_age_hours: int = 24) -> bool:
    """Check whether cached payload is within max_age_hours."""
    ts = payload.get('meta', {}).get('last_updated')
    if not ts:
        return False
    last = parse_to_utc(ts)
    if last is None:
        return False
    return (now_utc() - last) < timedelta(hours=max_age_hours)
