# Forta agent Dockerfile — standard SDK build pattern
# https://docs.forta.network/en/latest/deploying-your-agent/

FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production image ----
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY forta.config.json ./

# Forta SDK expects the agent entrypoint at dist/agent.js
CMD ["node", "dist/agent.js"]

# Forta standard labels
LABEL "network.forta.settings.agent-logs-enable"="true"
