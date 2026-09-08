# The E2E runtime: Playwright's browsers and system dependencies (which the
# developer host lacks entirely for WebKit) plus bun, so one image builds,
# serves and tests the app. The tag MUST match @playwright/test in
# package.json — tests/unit/e2e-runtime-config.test.ts enforces it.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Playwright's own recommendation for CI is to run as a non-root uid so files
# written into the mounted workspace do not end up root-owned.
ENV BUN_INSTALL=/usr/local
# unzip is the only tool bun's installer needs that this base image lacks
# (curl and ca-certificates are already present).
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.13" \
    && bun --version

WORKDIR /work

# The e2emodules named volume in compose.yaml is created empty by the Docker
# engine and defaults to root ownership; Docker seeds a new named volume from
# whatever is already at the mount point in the image, so pre-creating this
# directory with the right owner is what lets bun write into it as a
# non-root user. These args and compose.yaml's `user:` are fed from the same
# ${E2E_UID:-1000}/${E2E_GID:-1000} expressions (see compose.yaml's `build.args`),
# so build-time ownership and the runtime uid can never diverge.
ARG E2E_UID=1000
ARG E2E_GID=1000
RUN mkdir -p /work/node_modules && chown "${E2E_UID}:${E2E_GID}" /work/node_modules
