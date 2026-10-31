FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production
CMD ["node", "server.js"]
