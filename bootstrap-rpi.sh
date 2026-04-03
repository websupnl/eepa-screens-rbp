#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TARGET_SCRIPT="${REPO_ROOT}/scripts/rpi-bootstrap.sh"

if [[ ! -f "${TARGET_SCRIPT}" ]]; then
  echo "Doelscript niet gevonden: ${TARGET_SCRIPT}" >&2
  exit 1
fi

bash "${TARGET_SCRIPT}"
