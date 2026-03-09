"""
tools/scrape_bens_bites.py — Scrape Ben's Bites via Substack RSS feed.
Returns a list of article dicts matching the Output Payload schema.
"""
import feedparser
from datetime import datetime, timezone
from tools.utils import generate_id, parse_to_utc, now_utc

FEED_URL = "https://bensbites.substack.com/feed"
SOURCE_NAME = "Ben's Bites"
SOURCE_ICON = "🍪"


def scrape() -> dict:
    """
    Fetch and parse the Ben's Bites RSS feed.
    Returns: { "articles": [...], "source": "Ben's Bites", "error": None }
    """
    try:
        feed = feedparser.parse(FEED_URL)

        if feed.bozo and not feed.entries:
            raise ValueError(f"feedparser bozo error: {feed.bozo_exception}")

        articles = []
        for entry in feed.entries:
            # Parse publication date
            published_at = None
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                published_at = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

            title = entry.get('title', '').strip()
            url = entry.get('link', '').strip()

            # Clean up summary — strip HTML tags roughly
            raw_summary = entry.get('summary', '') or ''
            # Remove HTML if present
            import re
            summary = re.sub(r'<[^>]+>', '', raw_summary).strip()
            # Truncate to 280 chars
            if len(summary) > 280:
                summary = summary[:277] + '...'

            if not title or not url:
                continue

            article = {
                "id": generate_id(title, SOURCE_NAME),
                "title": title,
                "summary": summary,
                "url": url,
                "source": SOURCE_NAME,
                "source_icon": SOURCE_ICON,
                "published_at": published_at.isoformat() if published_at else now_utc().isoformat(),
                "fetched_at": now_utc().isoformat(),
                "is_saved": False,
                "tags": [],
            }
            articles.append(article)

        return {"articles": articles, "source": SOURCE_NAME, "error": None}

    except Exception as e:
        print(f"[SCRAPER ERROR] {SOURCE_NAME}: {e}")
        return {"articles": [], "source": SOURCE_NAME, "error": str(e)}


if __name__ == "__main__":
    import json, sys
    sys.path.insert(0, __file__.replace('/tools/scrape_bens_bites.py', ''))
    result = scrape()
    print(f"Fetched {len(result['articles'])} articles from {SOURCE_NAME}")
    if result['error']:
        print(f"Error: {result['error']}")
    else:
        print(json.dumps(result['articles'][:2], indent=2, default=str))
