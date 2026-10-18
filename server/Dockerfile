# Aetherion game server + built client in one image.
# Build from the REPOSITORY ROOT (the server imports ../shared and serves ../game/dist):
#   docker build -f server/Dockerfile -t aetherion .
#   docker run -p 8787:8787 -v aetherion-data:/app/server/data aetherion

# ---- stage 1: build the web client ----
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY game/package.json game/package-lock.json ./game/
RUN cd game && npm ci --no-audit --no-fund
COPY shared ./shared
COPY game ./game
RUN cd game && npx vite build

# ---- stage 2: runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 BOTS=40
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY shared ./shared
COPY server ./server
COPY --from=client /app/game/dist ./game/dist
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node
EXPOSE 8787
VOLUME ["/app/server/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
