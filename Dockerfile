FROM oven/bun:1
WORKDIR /app

# Install necessary tools for downloading
RUN apt-get update && apt-get install -y curl unzip

# Download and install Corrosion for amd64 Linux
# IMPORTANT: Replace with the correct version and download URL from superfly/corrosion releases
    ARG CORROSION_VERSION="v1.0.0"
    ARG CORROSION_DOWNLOAD_URL="https://github.com/joeblew999/binary-corrosion/releases/download/${CORROSION_VERSION}/corrosion-${CORROSION_VERSION}-linux-amd64.zip"
RUN curl -L ${CORROSION_DOWNLOAD_URL} -o /tmp/corrosion.zip && \
    unzip /tmp/corrosion.zip -d /tmp && \
    mv /tmp/corrosion /usr/local/bin/corrosion && \
    chmod +x /usr/local/bin/corrosion && \
    rm /tmp/corrosion.zip

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts api.ts queries.ts db.ts docs.ts types.ts sse.ts index.ts tsconfig.json ./
COPY routes/ ./routes/
COPY migrations/ ./migrations/
COPY static/ ./static/

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
