# The multiplayer game server only (no website, no models): the WebSocket server and the shared message definitions.
FROM node:22-slim
WORKDIR /app
# the server needs just two packages: ws (WebSockets) and tsx (runs TypeScript)
RUN npm init -y > /dev/null && npm install --no-audit --no-fund ws@8 tsx@4
COPY shared shared
COPY server server
ENV PORT=8090
EXPOSE 8090
CMD ["npx", "tsx", "server/index.ts"]
