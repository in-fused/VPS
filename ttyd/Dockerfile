###############################################################################
# ttyd — Browser-based terminal for server management
###############################################################################
# Adds git + docker CLI on top of ttyd so you can run:
#   docker compose ps / logs / restart
#   git pull && docker compose up -d --build
# Accessible at https://in-fused.org/terminal/ behind site auth.
###############################################################################

FROM tsl0922/ttyd:latest

# Install git + docker CLI + docker compose plugin
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl git ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    ARCH=$(uname -m) && \
    DOCKER_VER=27.3.1 && \
    curl -fsSL "https://download.docker.com/linux/static/stable/${ARCH}/docker-${DOCKER_VER}.tgz" \
        | tar xz --strip-components=1 -C /usr/local/bin docker/docker && \
    COMPOSE_ARCH=$([ "$ARCH" = "aarch64" ] && echo "linux-aarch64" || echo "linux-x86_64") && \
    mkdir -p /usr/local/lib/docker/cli-plugins && \
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-${COMPOSE_ARCH}" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
