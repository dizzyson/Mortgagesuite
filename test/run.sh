#!/bin/sh
# Pure-logic unit tests. No browser needed — these cover the parts of the
# patch layer that are just arithmetic and string handling, which is
# exactly where the ten-times-too-high lock extension rate was hiding.
set -e
for t in "$(dirname "$0")"/*.test.js; do
  echo "--- $(basename "$t")"
  node "$t"
  echo
done
