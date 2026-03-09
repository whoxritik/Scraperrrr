"""
tools/orchestrator.py — Master pipeline: run scrapers, merge, dedup, cache.
This is the single entry point called by the Flask API.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools import scrape_bens_bites, scrape_rundown
from tools.utils import filter_last_24h, deduplicate, save_to_cache, load_cache, now_utc, is_cache_fresh


def run(force_refresh: bool = False) -> dict:
    """
    Run all scrapers, merge, deduplicate, filter, cache, and return payload.
    
    Args:
        force_refresh: If True, always scrape even if cache is fresh.
    
    Returns:
        Full payload dict matching Output Payload schema in gemini.md.
    """
    # Check cache first (unless force refresh)
    if not force_refresh:
        cached = load_cache()
        if cached and is_cache_fresh(cached):
            print("[ORCHESTRATOR] Serving fresh cache.")
            cached['meta']['from_cache'] = True
            return cached

    print("[ORCHESTRATOR] Starting fresh scrape...")
    all_articles = []
    sources_scraped = []
    source_errors = {}

    # --- Scrape Ben's Bites ---
    bb_result = scrape_bens_bites.scrape()
    if bb_result['error']:
        source_errors["Ben's Bites"] = bb_result['error']
        sources_scraped.append({"name": "Ben's Bites", "status": "error", "icon": "🍪"})
    else:
        all_articles.extend(bb_result['articles'])
        sources_scraped.append({"name": "Ben's Bites", "status": "ok", "icon": "🍪"})

    # --- Scrape The Rundown ---
    rd_result = scrape_rundown.scrape()
    if rd_result['error']:
        source_errors["The Rundown"] = rd_result['error']
        sources_scraped.append({"name": "The Rundown", "status": "error", "icon": "📰"})
    else:
        all_articles.extend(rd_result['articles'])
        sources_scraped.append({"name": "The Rundown", "status": "ok", "icon": "📰"})

    # --- Reddit (placeholder) ---
    sources_scraped.append({"name": "Reddit", "status": "coming_soon", "icon": "🤖"})

    # --- Filter + Deduplicate ---
    filtered = filter_last_24h(all_articles)
    deduplicated = deduplicate(filtered)

    # Sort by published_at descending (newest first)
    deduplicated.sort(key=lambda a: a.get('published_at', ''), reverse=True)

    payload = {
        "articles": deduplicated,
        "meta": {
            "last_updated": now_utc().isoformat(),
            "sources_scraped": sources_scraped,
            "article_count": len(deduplicated),
            "errors": source_errors,
            "from_cache": False,
            "is_stale": False,
        }
    }

    # If zero articles but we have a stale cache, serve the stale cache
    if len(deduplicated) == 0:
        stale = load_cache()
        if stale:
            print("[ORCHESTRATOR] Zero new articles — serving stale cache.")
            stale['meta']['is_stale'] = True
            stale['meta']['from_cache'] = True
            stale['meta']['errors'] = source_errors
            return stale

    # Save fresh result to cache
    save_to_cache(payload)
    print(f"[ORCHESTRATOR] Done. {len(deduplicated)} articles cached.")
    return payload


if __name__ == "__main__":
    import json
    result = run(force_refresh=True)
    print(json.dumps(result['meta'], indent=2, default=str))
    print(f"\nTotal articles: {result['meta']['article_count']}")
    for a in result['articles'][:3]:
        print(f"  [{a['source']}] {a['title'][:60]}...")
