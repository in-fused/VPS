FROM python:3.12-slim

# System deps for Scrapling (fast fetcher only — no browser binaries needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: Browser binaries (scrapling install) removed to save ~600-800MB disk.
# The default "fast" fetcher (curl_cffi) handles 95% of scraping needs.
# To re-enable stealth/browser fetchers, uncomment and add browser system deps:
# RUN scrapling install

COPY api.py .

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
