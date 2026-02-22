#!/bin/bash
#
# Creates a local git tag with format "release-{version}"
# Reads version from package.json.
#
# Usage:
#   ./tools/create-release-tag.sh           # Local tag only
#   ./tools/create-release-tag.sh --push    # Also push tag to remote
#

set -e

cd "$(dirname "$0")/.."

VERSION=$(grep '"version"' package.json | sed 's/.*: "\([^"]*\)".*/\1/')
TAG="release-${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Tag '$TAG' already exists."
    exit 1
fi

git tag "$TAG"
echo "Created tag: $TAG"

if [ "$1" = "--push" ]; then
    git push origin "$TAG"
    echo "Pushed tag: $TAG"
fi
