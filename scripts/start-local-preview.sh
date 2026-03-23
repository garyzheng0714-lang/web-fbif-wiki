#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-5173}"
HOST="${HOST:-127.0.0.1}"
PAGE="preview/fbif-chat-brand.html"
PID_FILE="${ROOT_DIR}/.preview-server.pid"
LOG_FILE="${ROOT_DIR}/.preview-server.log"
MODE="${1:-}"

if [[ ! -f "$ROOT_DIR/$PAGE" ]]; then
  echo "Missing preview page: $ROOT_DIR/$PAGE" >&2
  exit 1
fi

URL="http://${HOST}:${PORT}/${PAGE}"
SERVER_CMD=(go run ./cmd/server)

if ! command -v go >/dev/null 2>&1; then
  echo "Missing Go runtime. Please install Go 1.26+ first." >&2
  exit 1
fi

is_running() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if [[ "$MODE" == "--stop" ]]; then
  if is_running; then
    pid="$(cat "$PID_FILE")"
    kill "$pid" >/dev/null 2>&1 || true
    rm -f "$PID_FILE"
    echo "Stopped preview server (pid: $pid)"
  else
    rm -f "$PID_FILE"
    echo "Preview server is not running"
  fi
  exit 0
fi

if [[ "$MODE" == "--status" ]]; then
  if is_running; then
    echo "Preview server is running (pid: $(cat "$PID_FILE"))"
    echo "Preview URL: ${URL}"
  else
    echo "Preview server is not running"
  fi
  exit 0
fi

if [[ "$MODE" == "--daemon" ]]; then
  if is_running; then
    echo "Preview server already running (pid: $(cat "$PID_FILE"))"
    echo "Preview URL: ${URL}"
    exit 0
  fi
  (
    cd "$ROOT_DIR"
    nohup env HOST="$HOST" PORT="$PORT" "${SERVER_CMD[@]}" >"$LOG_FILE" 2>&1 &
    echo "$!" > "$PID_FILE"
  )
  echo "Preview server started in background (pid: $(cat "$PID_FILE"))"
  echo "Preview URL: ${URL}"
  echo "Log file: ${LOG_FILE}"
  if command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  fi
  exit 0
fi

echo "Starting Go server at ${HOST}:${PORT}"
echo "Preview URL: ${URL}"

if command -v open >/dev/null 2>&1; then
  # Open browser in background on macOS; ignore failures in headless environments.
  open "$URL" >/dev/null 2>&1 || true
fi

cd "$ROOT_DIR"
exec env HOST="$HOST" PORT="$PORT" "${SERVER_CMD[@]}"
