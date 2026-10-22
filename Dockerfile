# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@12.15.0

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY artifacts/api-server ./artifacts/api-server
COPY lib ./lib

# Build API server and its libraries
RUN pnpm --filter @workspace/api-server run build

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
