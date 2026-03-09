# 🏗️ Scraper SOP — Architecture Layer 1

## Purpose
This document defines how, where, and when data is scraped for the AI News Dashboard.

## Sources

### 1. Ben's Bites
- **Platform:** Substack
- **Method:** RSS feed (XML)
- **URL:** `https://bensbites.substack.com/feed`
- **Fetch:** HTTP GET (no auth required for public posts)
- **Parser:** `feedparser` library
- **Fields extracted:** title, link, summary, published (RFC 2822 → ISO8601)
- **Filter:** `published_at` within last 24 hours
- **Rate limit:** 1 request per scrape cycle (max 1x/day)
- **Source icon:** 🍪
- **Edge cases:** If feed returns 0 items, log warning and return empty list (do NOT crash)

### 2. The Rundown AI
- **Platform:** Beehiiv (hosted at therundown.ai)
- **Method:** HTML scrape using requests + BeautifulSoup
- **URL:** `https://www.therundown.ai/`
- **Fetch:** HTTP GET with browser User-Agent header
- **Parser:** BeautifulSoup `html.parser`
- **Fields extracted:** title (h3 text), url (href), summary (subtitle text)
- **Date logic:** Dates not always on listing page; check `<time>` tag or meta tags on article page
- **Filter:** `published_at` within last 24 hours
- **Rate limit:** 2 requests per article (listing + detail page); cap at 10 articles max
- **Source icon:** 📰
- **Edge cases:** If site is unreachable, mark source as "unavailable" in meta block

## Output Contract
All scrapers return a `list[dict]` where each dict matches the Output Payload schema in `gemini.md`.

## Cache Policy
- Cache stored at `.tmp/articles_cache.json`
- Cache is valid for 24 hours from `meta.last_updated`
- If scrape returns 0 results, serve stale cache with an `is_stale: true` flag in meta
- Cache is ephemeral — never committed to git

## Error Handling (Self-Annealing Rule)
If a scraper fails:
1. Log the exception with source name + error message
2. Do NOT raise — return `{"articles": [], "source": "...", "error": "<msg>"}`
3. Orchestrator marks that source as `unavailable` in `meta.sources_scraped`
4. Dashboard shows source pill in greyed-out state
