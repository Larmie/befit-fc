#!/usr/bin/env bash
# Optional Cloudflare Pages build step: copies ONLY the app into dist/, so tests, package files and notes are not
# part of the published site at all (not even by an odd URL). It does nothing until Cloudflare is told to use it:
#   Pages project the-be-fit-club → Settings → Builds → Build command: bash site-build.sh · Build output directory: dist
# (AGENTS.md, "Keep tests off the live site"). Add any new top-level app file or folder to APP below.
set -euo pipefail
cd "$(dirname "$0")"
APP=(index.html classic.html sw.js manifest.json icon.svg Image.jpg _redirects css js)
rm -rf dist
mkdir dist
for f in "${APP[@]}"; do cp -R "$f" dist/; done
echo "site-build: copied ${#APP[@]} app items into dist/ ($(find dist -type f | wc -l | tr -d ' ') files)"
