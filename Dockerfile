FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts api.ts queries.ts db.ts docs.ts types.ts sse.ts index.ts tsconfig.json ./
COPY routes/ ./routes/
COPY migrations/ ./migrations/
COPY static/ ./static/

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
