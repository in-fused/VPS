###############################################################################
# Custom Caddy — Standard Caddy + Rate Limiting Module
###############################################################################
# Downloads a pre-built Caddy binary with github.com/mholt/caddy-ratelimit
# from the official Caddy download API. No Go compilation needed.
#
# The rate_limit directive enforces per-IP request limits at the reverse
# proxy level — attackers cannot bypass it from the client side.
###############################################################################

FROM caddy:2-alpine

RUN wget -O /usr/bin/caddy \
    "https://caddyserver.com/api/download?os=linux&arch=amd64&p=github.com/mholt/caddy-ratelimit" && \
    chmod +x /usr/bin/caddy && \
    caddy version
