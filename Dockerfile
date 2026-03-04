# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:23-alpine AS builder

WORKDIR /app

# Install root (frontend) dependencies
COPY package*.json ./
RUN npm ci

# Install server dependencies
COPY server/package.json ./server/
# Using install instead of ci for server to avoid strict lockfile issues if they arise
RUN cd server && npm install

# Copy everything else and build the React frontend
COPY . .
RUN npm run build


# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:23-alpine AS runner

# Install necessary libraries for postgres tools
# These are the dependencies that pg_dump and libpq from PG 18 require
RUN apk add --no-cache \
    libpq \
    zstd-libs \
    lz4-libs \
    krb5-libs \
    libldap \
    libedit \
    readline \
    libgcc \
    libstdc++

# Copy pg_dump and psql from official postgres image to ensure version match
COPY --from=postgres:18.1-alpine /usr/local/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres:18.1-alpine /usr/local/bin/psql /usr/local/bin/psql

# Copy the specific libpq.so from the postgres image as it might have a newer version/features
# but rely on system packages for widespread libs like zstd, lz4, etc.
COPY --from=postgres:18.1-alpine /usr/local/lib/libpq.so* /usr/local/lib/

# Set library path
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

WORKDIR /app

# Copy the built React app
COPY --from=builder /app/dist ./dist

# Copy the server and its installed node_modules
COPY --from=builder /app/server ./server

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/index.js"]
