#! /bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="$SCRIPT_DIR/tmp/chrome-test-profile"

mkdir -p "$PROFILE_DIR"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --user-data-dir="$PROFILE_DIR" --remote-debugging-port=9333 --no-default-browser-check --no-first-run

