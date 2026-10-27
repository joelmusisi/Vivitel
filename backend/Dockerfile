FROM node:20-bullseye

WORKDIR /usr/src/app

# Install build deps for native modules
RUN apt-get update && apt-get install -y build-essential python3 make g++ && rm -rf /var/lib/apt/lists/*

# Allow building from repo root by overriding APP_DIR (default is current folder)
ARG APP_DIR=.

# Copy package files first to install deps
COPY ${APP_DIR}/package.json ${APP_DIR}/package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY ${APP_DIR}/ ./

# Build TypeScript vps server
RUN npm run build:vps

EXPOSE 8787

ENV NODE_ENV=production

CMD ["node", "build/vps_server.js"]
