#!/bin/bash

set -euo pipefail

CORROSION_VERSION="$1"
CORROSION_DOWNLOAD_URL="$2"
INSTALL_DIR="${3:-./bin}" # Default install directory is ./bin

echo "Installing Corrosion v${CORROSION_VERSION} from ${CORROSION_DOWNLOAD_URL} to ${INSTALL_DIR}..."

# Create install directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Download the zip file
curl -L "$CORROSION_DOWNLOAD_URL" -o "/tmp/corrosion-v${CORROSION_VERSION}.zip"

# Unzip the binary
unzip "/tmp/corrosion-v${CORROSION_VERSION}.zip" -d "/tmp/corrosion-extract"

# Move the binary to the install directory and make it executable
# Assuming the binary inside the zip is named 'corrosion'
mv "/tmp/corrosion-extract/corrosion" "$INSTALL_DIR/corrosion"
chmod +x "$INSTALL_DIR/corrosion"

# Clean up temporary files
rm "/tmp/corrosion-v${CORROSION_VERSION}.zip"
rm -rf "/tmp/corrosion-extract"

echo "Corrosion v${CORROSION_VERSION} installed successfully to $INSTALL_DIR/corrosion"
