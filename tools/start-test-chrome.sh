#! /bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_DIR="$SCRIPT_DIR/tmp/chrome-test-profile"

mkdir -p "$PROFILE_DIR"
# --autoplay-policy: lets the in-panel test runner's tone page (test-audio.html) play with no user gesture; the audio cases need it
# --disable-backgrounding-occluded-windows, --disable-background-timer-throttling, --disable-renderer-backgrounding:
#   keep the side panel running at full speed while the test window is covered or Chrome is not the front app,
#   so a run behaves the same whether or not anyone is watching it
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --user-data-dir="$PROFILE_DIR" --remote-debugging-port=9333 --no-default-browser-check --no-first-run --autoplay-policy=no-user-gesture-required \
  --disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding

