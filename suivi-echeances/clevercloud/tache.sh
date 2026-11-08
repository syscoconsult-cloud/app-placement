#!/bin/bash
# Lance une tâche planifiée de l'application (« synchroniser » ou « alertes »).
set -euo pipefail
cd "$(dirname "$0")/.."
exec python -m flask --app app "$@"
