"""
server.py — Flask backend for the AI News Dashboard.
Serves the dashboard UI and the /api/articles JSON endpoint.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from tools.orchestrator import run as orchestrate
from tools.utils import load_cache

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)


@app.route('/')
def index():
    """Serve the dashboard."""
    return render_template('index.html')


@app.route('/api/articles')
def get_articles():
    """
    Scrape + return fresh articles (or serve cache if still fresh).
    Query param: ?refresh=true to force a fresh scrape.
    """
    force = request.args.get('refresh', 'false').lower() == 'true'
    payload = orchestrate(force_refresh=force)
    return jsonify(payload)


@app.route('/api/articles/cached')
def get_cached_articles():
    """Return the last cached result without triggering a new scrape."""
    cached = load_cache()
    if cached:
        cached['meta']['from_cache'] = True
        return jsonify(cached)
    return jsonify({
        "articles": [],
        "meta": {
            "last_updated": None,
            "sources_scraped": [],
            "article_count": 0,
            "errors": {},
            "from_cache": True,
            "is_stale": True,
            "message": "No cache found. Visit /api/articles to trigger a scrape."
        }
    }), 200


@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "message": "AI News Dashboard is running"})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print(f"🚀 AI News Dashboard running at http://localhost:{port}")
    app.run(debug=True, host='0.0.0.0', port=port)
