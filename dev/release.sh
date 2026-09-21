#!/bin/sh
# Stamp a new version into sw.js and app.js, run tests, commit, push.
# Usage: dev/release.sh "commit message"
set -e
cd "$(dirname "$0")/.."
[ -n "$1" ] || { echo "usage: dev/release.sh \"commit message\""; exit 1; }
today=$(date +%Y.%m.%d)
last=$(grep -o "$today-[0-9]*" sw.js | head -1 | sed "s/.*-//")
n=$(( ${last:-0} + 1 ))
v="$today-$n"
sed -i '' "s/const VERSION = \"[^\"]*\"/const VERSION = \"$v\"/" sw.js
sed -i '' "s/export const APP_VERSION = \"[^\"]*\"/export const APP_VERSION = \"$v\"/" app.js
node --test >/dev/null 2>&1 || { echo "tests failed"; node --test 2>&1 | grep -E "^✖" ; exit 1; }
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WLrhpHKqsaPti9HHEtdnxK"
git push -q origin main
echo "released $v"
