###############################################################################
# Custom Caddy — Standard Caddy + Rate Limiting Module
###############################################################################
# Builds Caddy with github.com/mholt/caddy-ratelimit for brute force
# protection on /auth/verify and other sensitive endpoints.
#
# The rate_limit directive enforces per-IP request limits at the reverse
# proxy level — attackers cannot bypass it from the client side.
###############################################################################

FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
