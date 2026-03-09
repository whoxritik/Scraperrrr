# 📜 gemini.md — Project Constitution
> **Status:** � ACTIVE — Blueprint Locked, Building Phase 1
> **Last Updated:** 2026-03-09

---

## 🎯 North Star
> Build a **gorgeous, interactive news dashboard** that scrapes the latest articles (last 24 hours) from Ben's Bites, The AI Rundown, and Reddit — displays them in a beautiful UI, allows saving articles (persisted across refreshes), and auto-refreshes every 24 hours. Future: sync to Supabase.

---

## 📐 Data Schema
> **STATUS: LOCKED 🔒**

### Input Payload (Scraper Targets)
```json
{
  "sources": [
    { "name": "Ben's Bites",      "url": "https://www.bensbites.com/",        "type": "newsletter" },
    { "name": "The AI Rundown",   "url": "https://www.theairundown.ai/",      "type": "newsletter" },
    { "name": "Reddit",           "url": "https://www.reddit.com/r/artificial/top/.json?t=day", "type": "reddit" }
  ],
  "lookback_hours": 24
}
```

### Output Payload (Article Object)
```json
{
  "articles": [
    {
      "id": "string (sha256 hash of title+source)",
      "title": "string",
      "summary": "string",
      "url": "string",
      "source": "Ben's Bites | The AI Rundown | Reddit",
      "source_icon": "string (emoji or icon path)",
      "published_at": "ISO8601 timestamp",
      "fetched_at": "ISO8601 timestamp",
      "is_saved": false,
      "tags": ["string"]
    }
  ],
  "meta": {
    "last_updated": "ISO8601 timestamp",
    "sources_scraped": ["string"],
    "article_count": 0
  }
}
```

### Persistence Schema (localStorage → Supabase later)
```json
{
  "saved_articles": ["article_id_1", "article_id_2"],
  "cached_articles": [...],
  "cache_timestamp": "ISO8601 timestamp"
}
```

---

## 🏛️ Architectural Invariants
- All intermediate data lives in `.tmp/` — ephemeral, never committed
- All secrets live in `.env` — never hardcoded
- All business logic flows through `tools/` — atomic Python scripts only
- LLM reasoning is for routing only; never for deterministic data transformation
- Dashboard reads from `/api/articles` endpoint served by `server.py`
- Saved articles persist in `localStorage` until Supabase is wired
- A project is only **COMPLETE** when the payload is in its final cloud destination

---

## 📏 Behavioral Rules
1. **24-hour window only** — Articles older than 24 hours are filtered out
2. **Deduplication** — Articles with identical `id` (title+source hash) are dropped
3. **Save persists** — Saved article IDs survive page refreshes via localStorage
4. **No stale cache** — If scrape returns 0 new articles, show last good cache with age indicator
5. **Graceful degradation** — If a source fails to scrape, show it as "unavailable" — never crash the dashboard
6. **No hallucination** — Never fabricate article content; only display scraped data

---

## 🔗 Integrations & Services
| Service | Status | Notes |
|---------|--------|-------|
| Ben's Bites scraper | 🔴 Building | Newsletter archive |
| The AI Rundown scraper | 🔴 Building | Newsletter archive |
| Reddit scraper | 🟡 Later | JSON API |
| Supabase | 🟡 Later | Persistence layer |
| Flask (local server) | 🔴 Building | API + dashboard host |

---

## 🗄️ Maintenance Log
| Date | Change | Author |
|------|--------|--------|
| 2026-03-09 | Constitutional init | System Pilot |
| 2026-03-09 | Schema locked from Discovery answers | System Pilot |
