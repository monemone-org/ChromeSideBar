#!/bin/bash
#
# Updates docs/public/latest.version based on the number of commits
# that touched docs/news/news.md
#
# Usage:
#   ./tools/update-news-version.sh            # Update version file only
#   ./tools/update-news-version.sh --commit   # Update and stage

set -euo pipefail

cd "$(dirname "$0")/.."

printHelp()
{
    echo "Usage: ./tools/update-news-version.sh [--commit|-c]"
    echo ""
    echo "Updates docs/public/latest.version based on the number of commits"
    echo "that touched docs/news/news.md."
    echo ""
    echo "Options:"
    echo "  --commit, -c    Stage the updated version file"
    echo "  --help, -h      Show this help message"
}

# Parse flags
COMMIT=false
for arg in "$@"; do
    case "$arg" in
        --commit|-c) COMMIT=true ;;
        --help|-h) printHelp; exit 0 ;;
    esac
done

NEWS_VERSION_FILE="docs/public/latest.version"
NEWS_MD_FILE="docs/news/news.md"

# Count commits that touched news.md
NEWS_VERSION=$(git rev-list --count HEAD -- "$NEWS_MD_FILE")

echo "Updating news version to ${NEWS_VERSION}"

# Create directory if it doesn't exist
mkdir -p "$(dirname "$NEWS_VERSION_FILE")"

# Write version
echo "$NEWS_VERSION" > "$NEWS_VERSION_FILE"

echo "Updated ${NEWS_VERSION_FILE} to ${NEWS_VERSION}"

# Commit version changes
if [ "$COMMIT" = true ]; then
    git commit -m "build: Bump news version to ${NEWS_VERSION}"
fi
