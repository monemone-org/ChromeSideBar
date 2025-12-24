#!/bin/bash
#
# Updates version in package.json and manifest.json
# Format: {major}.{minor}.{build_number}
# Build number = git commit count
#
# Usage:
#   ./tools/update-version.sh          # Update build number only
#   ./tools/update-version.sh major    # Bump major version
#   ./tools/update-version.sh minor    # Bump minor version
#   ./tools/update-version.sh 2 1      # Set major=2, minor=1

set -e

cd "$(dirname "$0")/.."

# Get current version from package.json
CURRENT_VERSION=$(grep '"version"' package.json | sed 's/.*: "\([^"]*\)".*/\1/')

# Parse major.minor from current version (default to 1.0 if not set properly)
if [[ "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\. ]]; then
    MAJOR="${BASH_REMATCH[1]}"
    MINOR="${BASH_REMATCH[2]}"
else
    MAJOR=1
    MINOR=0
fi

# Handle arguments
if [ "$1" = "major" ]; then
    MAJOR=$((MAJOR + 1))
    MINOR=0
elif [ "$1" = "minor" ]; then
    MINOR=$((MINOR + 1))
elif [ -n "$1" ] && [ -n "$2" ]; then
    MAJOR="$1"
    MINOR="$2"
fi

# Get build number (git commit count)
BUILD=$(git rev-list --count HEAD)

# Construct new version
NEW_VERSION="${MAJOR}.${MINOR}.${BUILD}"

echo "Updating version to ${NEW_VERSION}"

# Update package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" package.json
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" package.json
fi

# Update manifest.json
MANIFEST="public/manifest.json"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$MANIFEST"
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$MANIFEST"
fi

echo "Updated package.json and manifest.json to version ${NEW_VERSION}"
