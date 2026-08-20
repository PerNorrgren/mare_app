# Mare companion app — separate Railway service from per_bot, same
# project. Plain Dockerfile (not Nixpacks) for the same reason per_bot
# uses one: full, predictable control over what's installed.
FROM node:20-bookworm-slim

WORKDIR /app

# Dependencies first for Docker layer caching — only re-runs when
# package.json/package-lock.json actually change.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Railway sets PORT itself at runtime — server.js already reads
# process.env.PORT.
CMD ["node", "server.js"]
