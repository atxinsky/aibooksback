#!/bin/sh
set -eu

store_file="${AI_BOOK_BACK_STORE_FILE:-/data/admin-store.json}"
store_dir="$(dirname "$store_file")"

mkdir -p "$store_dir"
chown -R node:node "$store_dir" 2>/dev/null || true

exec su-exec node "$@"
