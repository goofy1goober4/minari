#!/usr/bin/env bash
# Launch llama-server for Minari (E2B llama.cpp track).
# Usage: ./scripts/llamacpp-serve.sh
set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
MODEL="${MODEL:-$HOME/llama-models/gemma-4-E2B-it-Q4_K_M.gguf}"
MMPROJ="${MMPROJ:-$HOME/llama-models/mmproj-F16.gguf}"
PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"
CTX="${CTX:-8192}"
ALIAS="${ALIAS:-gemma4:e2b}"

exec "$LLAMA_BIN" \
  -m "$MODEL" \
  --mmproj "$MMPROJ" \
  --host "$HOST" \
  --port "$PORT" \
  -c "$CTX" \
  -ngl 99 \
  --alias "$ALIAS" \
  --jinja \
  --reasoning off
