# PQSafe AgentPay — multi-stage Dockerfile for SDK testing
# Not for production deployment — for local dev environment and CI parity.
#
# Build:  docker build -t pqsafe-agent-pay .
# Test:   docker run --rm pqsafe-agent-pay npm test
# Bench:  docker run --rm pqsafe-agent-pay npm run bench

# ---------------------------------------------------------------------------
# Stage 1: deps — install only production + dev deps (layer-cached)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2: builder — compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build && npm run typecheck

# ---------------------------------------------------------------------------
# Stage 3: test runner — run the full test suite
# ---------------------------------------------------------------------------
FROM node:20-alpine AS test

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/tests ./tests
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/vitest.config.ts ./

# Default command: run tests
CMD ["npm", "test"]

# ---------------------------------------------------------------------------
# Stage 4: sdk — minimal image with only the built SDK (no test deps)
#          Use this stage for integration testing against the SDK output.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS sdk

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Install prod deps only
RUN npm ci --omit=dev --ignore-scripts

CMD ["node", "--input-type=module", "-e", "import('@pqsafe/agent-pay').then(m => console.log('PQSafe SDK loaded OK', Object.keys(m)))"]
