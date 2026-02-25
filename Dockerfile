# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:23-alpine AS builder

WORKDIR /app

# Install root (frontend) dependencies
COPY package*.json ./
RUN npm ci

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci

# Copy everything else and build the React frontend
COPY . .
RUN npm run build


# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:23-alpine AS runner

# Install postgresql-client so backup/restore can use pg_dump and psql directly
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy the built React app
COPY --from=builder /app/dist ./dist

# Copy the server and its installed node_modules
COPY --from=builder /app/server ./server

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/index.js"]
