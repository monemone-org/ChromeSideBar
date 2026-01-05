#!/bin/bash
#
# Build and package extension for Chrome Web Store submission
#
# Usage:
#   ./tools/build-release.sh
#
# Output:
#   releases/sidebar-for-arc-users-{version}.zip

set -e

cd "$(dirname "$0")/.."

echo "Updating version..."

# Update version number
# ./tools/update-version.sh

# Re-read version after update
VERSION=$(grep '"version"' public/manifest.json | sed 's/.*: "\([^"]*\)".*/\1/')

echo "Building version ${VERSION}..."

# Run npm build
npm run build

# Create releases directory if it doesn't exist
mkdir -p releases

# Define output filename
ZIPFILE="releases/sidebar-for-arc-users-${VERSION}.zip"

# Remove old zip if exists
rm -f "$ZIPFILE"

# Create zip from dist/ contents (not the folder itself)
cd dist
zip -r "../$ZIPFILE" .
cd ..

echo ""
echo "Build complete: $ZIPFILE"
echo "Ready for Chrome Web Store submission"
