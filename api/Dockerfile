# Platform API and webhook worker (Bun + Hono). Build context is the repo root,
# because the workspace lockfile lives there; only `api/` is copied into the image.
# One image, two Railway services: the default CMD runs the API; the worker
# service overrides the start command with `bun src/worker/index.ts`.
# Runbook: docs/onboarding.md, "Deployment and DNS".

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && npm install -g bun@1.4.2
WORKDIR /app

# Workspace manifests only, so the install layer is cached until a lockfile changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/
COPY sdk/ts/package.json sdk/ts/
COPY cli/package.json cli/
COPY web/package.json web/
COPY docs-site/package.json docs-site/
COPY examples/saas/package.json examples/saas/
# --ignore-scripts: ws lists bufferutil/utf-8-validate as optional native peers; Bun uses its own WebSocket, so they are never compiled.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @elapse/api

# Runtime needs source, migrations, and the synced deployment records; tests stay out.
COPY api/src api/src
COPY api/migrations api/migrations
COPY api/deployments api/deployments
COPY api/scripts api/scripts
COPY api/tsconfig.json api/bunfig.toml api/

WORKDIR /app/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "bun run migrate && bun src/index.ts"]
