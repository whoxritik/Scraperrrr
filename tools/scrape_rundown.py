"""
tools/scrape_rundown.py — Scrape The Rundown AI from therundown.ai.
Returns a list of article dicts matching the Output Payload schema.
"""
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from tools.utils import generate_id, now_utc, parse_to_utc

BASE_URL = "https://www.therundown.ai"
SOURCE_NAME = "The Rundown"
SOURCE_ICON = "📰"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}
MAX_ARTICLES = 5  # Reduced to stay within Vercel's serverless timeout budget


def scrape() -> dict:
    """
    Fetch and parse The Rundown AI homepage.
    Returns: { "articles": [...], "source": "The Rundown", "error": None }
    """
    try:
        resp = requests.get(BASE_URL, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        articles = []
        seen_urls = set()

        # Find article cards — h3 tags with links are the article titles
        # The listing shows: <h3>Title</h3> with sibling/parent <a href="/p/...">
        links_tried = 0

        # Strategy: find all <a> tags pointing to /p/ (article paths)
        all_links = soup.find_all('a', href=re.compile(r'^/p/|^https://www\.therundown\.ai/p/'))
        for a_tag in all_links:
            if links_tried >= MAX_ARTICLES:
                break

            href = a_tag.get('href', '')
            if not href:
                continue
            url = href if href.startswith('http') else BASE_URL + href

            if url in seen_urls:
                continue
            seen_urls.add(url)

            # Get title from h3 inside or near this link, or from link text
            title = ''
            h3 = a_tag.find('h3')
            if h3:
                title = h3.get_text(strip=True)
            if not title:
                title = a_tag.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            # Get summary — look for paragraph sibling text near the link
            summary = ''
            parent = a_tag.parent
            if parent:
                p_tags = parent.find_all('p')
                for p in p_tags:
                    text = p.get_text(strip=True)
                    if text and len(text) > 20:
                        summary = text[:280]
                        break

            links_tried += 1

            # Use current time as published_at (avoids per-article HTTP requests that cause timeouts)
            published_at = now_utc()

            article = {
                "id": generate_id(title, SOURCE_NAME),
                "title": title,
                "summary": summary,
                "url": url,
                "source": SOURCE_NAME,
                "source_icon": SOURCE_ICON,
                "published_at": published_at.isoformat(),
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
    sys.path.insert(0, __file__.replace('/tools/scrape_rundown.py', ''))
    result = scrape()
    print(f"Fetched {len(result['articles'])} articles from {SOURCE_NAME}")
    if result['error']:
        print(f"Error: {result['error']}")
    else:
        print(json.dumps(result['articles'][:2], indent=2, default=str))
