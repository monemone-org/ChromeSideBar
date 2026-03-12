#!/bin/bash
#
# Updates version in package.json and manifest.json
# Format: {major}.{minor}.{build_number}
# Build number = git commit count (source-code-only commits)
#
# Usage:
#   ./tools/update-version.sh                      # Update build number only
#   ./tools/update-version.sh --major 2             # Set major version to 2
#   ./tools/update-version.sh --minor 1             # Set minor version to 1
#   ./tools/update-version.sh --major 2 --minor 1   # Set both
#   ./tools/update-version.sh --commit              # Update and commit
#   ./tools/update-version.sh --major 2 -c          # Set major and commit

set -euo pipefail

cd "$(dirname "$0")/.."

printHelp()
{
    echo "Usage: ./tools/update-version.sh [--major N] [--minor N] [--commit|-c]"
    echo ""
    echo "Updates version in package.json and manifest.json."
    echo "Version format: {major}.{minor}.{build_number}"
    echo "Build number is the git commit count of source-code-only commits."
    echo ""
    echo "Options:"
    echo "  --major N       Set major version to N"
    echo "  --minor N       Set minor version to N"
    echo "  --commit, -c    Stage and commit the version changes"
    echo "  --help, -h      Show this help message"
}

# Parse flags
COMMIT=false
NEW_MAJOR=""
NEW_MINOR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --commit|-c) COMMIT=true ;;
        --help|-h) printHelp; exit 0 ;;
        --major) NEW_MAJOR="$2"; shift ;;
        --minor) NEW_MINOR="$2"; shift ;;
    esac
    shift
done

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

# Apply overrides
if [ -n "$NEW_MAJOR" ]; then
    MAJOR="$NEW_MAJOR"
fi
if [ -n "$NEW_MINOR" ]; then
    MINOR="$NEW_MINOR"
fi

# Get build number (count only commits that touch extension source/build files)
BUILD=$(git rev-list --count HEAD -- src/ \
    public/icon.png public/icon16.png public/icon32.png public/welcome/ \
    vite.config.ts tailwind.config.js postcss.config.js \
    tsconfig.json tsconfig.node.json .env.development index.html)

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
git add package.json public/manifest.json

# Commit version changes
if [ "$COMMIT" = true ]; then
    git commit -m "build: Bump version to ${NEW_VERSION}"
fi



