FROM oven/bun:1
WORKDIR /app

# Install necessary tools for downloading
RUN apt-get update && apt-get install -y curl unzip

# Copy the installation script
COPY scripts/install-corrosion.sh ./scripts/

# Download and install Corrosion for amd64 Linux
ARG CORROSION_VERSION="v1.0.0"
ARG CORROSION_DOWNLOAD_URL="https://github.com/joeblew999/binary-corrosion/releases/download/${CORROSION_VERSION}/corrosion-${CORROSION_VERSION}-linux-amd64.zip"

RUN bash ./scripts/install-corrosion.sh "${CORROSION_VERSION}" "${CORROSION_DOWNLOAD_URL}" "/usr/local/bin"

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts api.ts queries.ts db.ts docs.ts types.ts sse.ts index.ts tsconfig.json ./
COPY routes/ ./routes/
COPY migrations/ ./migrations/
COPY static/ ./static/
COPY corrosion-local-manager.ts corrosion-db.ts ./

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
