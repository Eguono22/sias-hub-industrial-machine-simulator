#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install -r requirements.txt
simulator_port="${PORT:-8001}"
printf '\nDashboard: http://localhost:%s\nPress Ctrl+C to stop.\n\n' "$simulator_port"
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$simulator_port"
