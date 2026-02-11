#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

if base64 --help 2>/dev/null | grep -q -- '-w'; then
  base64 -w 0 "$ENV_FILE"
else
  base64 < "$ENV_FILE" | tr -d '\n'
fi

echo
