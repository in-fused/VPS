"""
Scrapling API — Lightweight web scraping service for OpenClaw agents.

Endpoints:
  GET  /health         — Health check
  POST /scrape         — Scrape a single URL
  POST /scrape/batch   — Scrape multiple URLs

Agents call this via: exec curl http://scrapling:8000/scrape -d '{"url":"..."}'
"""

import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Scrapling API", version="1.0.0")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    url: str
    method: str = "fast"              # "fast" (curl_cffi) | "stealth" | "browser"
    selectors: Optional[dict] = None  # {"label": "css selector"} — extract specific elements
    extract_links: bool = False       # return all <a href> links
    extract_images: bool = False      # return all <img src> URLs
    timeout: int = 30                 # request timeout in seconds


class BatchScrapeRequest(BaseModel):
    urls: list[str]
    method: str = "fast"
    timeout: int = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _do_fetch(url: str, method: str, timeout: int):
    """Fetch a URL using the specified Scrapling fetcher.

    Methods:
      - "fast": curl_cffi-based HTTP with TLS fingerprint spoofing. No browser needed.
      - "stealth": Patchright (stealth Chromium). Bypasses Cloudflare. Needs browser binaries.
      - "browser": Playwright Chromium. Full JS rendering. Needs browser binaries.
    """
    if method == "fast":
        from scrapling.fetchers import Fetcher
        return Fetcher.get(url, timeout=timeout)
    elif method == "stealth":
        try:
            from scrapling.fetchers import StealthyFetcher
            return StealthyFetcher.fetch(url, timeout=timeout)
        except Exception as e:
            if "browser" in str(e).lower() or "executable" in str(e).lower():
                raise RuntimeError(
                    "Stealth mode requires browser binaries. "
                    "Run 'scrapling install' in the container or rebuild with browser support."
                ) from e
            raise
    elif method == "browser":
        try:
            from scrapling.fetchers import DynamicFetcher
            return DynamicFetcher.fetch(url, timeout=timeout)
        except Exception as e:
            if "browser" in str(e).lower() or "executable" in str(e).lower():
                raise RuntimeError(
                    "Browser mode requires browser binaries. "
                    "Run 'scrapling install' in the container or rebuild with browser support."
                ) from e
            raise
    else:
        raise ValueError(f"Unknown method '{method}'. Use: fast, stealth, browser")


def _extract_page(page, req_selectors, extract_links, extract_images):
    """Pull useful data out of a Scrapling page/adaptor object."""
    result = {
        "status": getattr(page, "status", None),
        "title": None,
        "text": None,
        "selected": None,
        "links": None,
        "images": None,
    }

    # Title
    try:
        title_el = page.css("title::text")
        result["title"] = title_el.get() if title_el else None
    except Exception:
        pass

    # Full text content (cleaned)
    try:
        result["text"] = page.get_all_text(separator="\n", strip=True)
    except AttributeError:
        # Fallback: extract all text nodes
        try:
            result["text"] = page.css("body ::text").getall()
            if isinstance(result["text"], list):
                result["text"] = "\n".join(t.strip() for t in result["text"] if t.strip())
        except Exception:
            result["text"] = str(page.text) if hasattr(page, "text") else None

    # CSS selectors
    if req_selectors:
        result["selected"] = {}
        for label, selector in req_selectors.items():
            try:
                result["selected"][label] = page.css(selector).getall()
            except Exception as e:
                result["selected"][label] = f"error: {e}"

    # Links
    if extract_links:
        try:
            result["links"] = list(set(
                a.attrib.get("href", "")
                for a in page.css("a[href]")
                if a.attrib.get("href", "").startswith(("http", "/"))
            ))
        except Exception:
            result["links"] = []

    # Images
    if extract_images:
        try:
            result["images"] = list(set(
                img.attrib.get("src", "")
                for img in page.css("img[src]")
                if img.attrib.get("src", "")
            ))
        except Exception:
            result["images"] = []

    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "scrapling"}


@app.get("/scrape")
def scrape_get(url: str, method: str = "fast", extract_links: bool = False,
               extract_images: bool = False, timeout: int = 30):
    """Simple GET endpoint for quick scraping via wget/web_fetch.

    Usage: wget -qO- 'http://scrapling:8000/scrape?url=https://example.com'
    """
    req = ScrapeRequest(url=url, method=method, extract_links=extract_links,
                        extract_images=extract_images, timeout=timeout)
    return scrape(req)


@app.post("/scrape")
def scrape(req: ScrapeRequest):
    """Scrape a single URL and return structured content."""
    start = time.time()

    try:
        page = _do_fetch(req.url, req.method, req.timeout)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {e}")

    data = _extract_page(page, req.selectors, req.extract_links, req.extract_images)
    data["url"] = req.url
    data["metadata"] = {
        "fetcher": req.method,
        "elapsed_ms": int((time.time() - start) * 1000),
    }
    return data


@app.post("/scrape/batch")
def scrape_batch(req: BatchScrapeRequest):
    """Scrape multiple URLs sequentially. Returns results for each."""
    results = []
    for url in req.urls[:10]:  # cap at 10 to prevent abuse
        start = time.time()
        try:
            page = _do_fetch(url, req.method, req.timeout)
            data = _extract_page(page, None, False, False)
            data["url"] = url
            data["error"] = None
        except Exception as e:
            data = {"url": url, "error": str(e), "text": None, "title": None}
        data["elapsed_ms"] = int((time.time() - start) * 1000)
        results.append(data)

    return {"count": len(results), "results": results}
