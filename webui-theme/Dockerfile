###############################################################################
# Custom Open WebUI — in-fused.org Golden Cyber Techno Theme
###############################################################################
# Extends the official Open WebUI image with a custom CSS theme.
# The CSS is copied into Open WebUI's static directory (served at /static/)
# and a <link> tag is injected into the SPA entry point (index.html).
#
# Build:  docker compose build open-webui
# Deploy: docker compose up -d open-webui
###############################################################################

FROM ghcr.io/open-webui/open-webui:main

# Copy the custom CSS into Open WebUI's static assets directory.
# The Python backend mounts STATIC_DIR (open_webui/static/) at /static/,
# so this file will be served at /static/custom.css.
COPY custom.css /app/backend/open_webui/static/custom.css

# Inject a <link> to our custom CSS right before </head> in the SPA entry HTML.
# Search multiple known paths since the structure may vary between versions.
# Falls back to a broad find if none of the known paths match.
RUN INDEX_HTML="" && \
    for f in \
      /app/build/index.html \
      /app/backend/build/index.html \
      /app/backend/open_webui/frontend/index.html; \
    do \
      if [ -f "$f" ]; then INDEX_HTML="$f"; break; fi; \
    done && \
    if [ -z "$INDEX_HTML" ]; then \
      INDEX_HTML=$(find /app -name "index.html" -path "*/build/*" -type f 2>/dev/null | head -1); \
    fi && \
    if [ -n "$INDEX_HTML" ]; then \
      sed -i 's|</head>|<link rel="stylesheet" href="/static/custom.css"></head>|' "$INDEX_HTML" && \
      echo "SUCCESS: Injected custom.css link into $INDEX_HTML"; \
    else \
      echo "WARNING: Could not find index.html — dumping file structure for debugging:" && \
      find /app -name "*.html" -type f 2>/dev/null; \
      exit 1; \
    fi
