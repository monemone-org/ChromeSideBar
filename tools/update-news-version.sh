#!/bin/bash
#
# Updates docs/news/latest.version based on the number of commits
# that touched docs/news/news.md
#
# Usage:
#   ./tools/update-news-version.sh

set -e

cd "$(dirname "$0")/.."

NEWS_VERSION_FILE="docs/news/latest.version"
NEWS_MD_FILE="docs/news/news.md"

# Count commits that touched news.md
NEWS_VERSION=$(git rev-list --count HEAD -- "$NEWS_MD_FILE")

echo "Updating news version to ${NEWS_VERSION}"

# Create directory if it doesn't exist
mkdir -p "$(dirname "$NEWS_VERSION_FILE")"

# Write version
echo "$NEWS_VERSION" > "$NEWS_VERSION_FILE"

echo "Updated ${NEWS_VERSION_FILE} to ${NEWS_VERSION}"

# Stage the file
git add "$NEWS_VERSION_FILE"
