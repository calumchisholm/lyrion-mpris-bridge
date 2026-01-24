#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${ROOT_DIR}/extension"
DIST_DIR="${ROOT_DIR}/dist"

if [[ ! -d "${EXT_DIR}" ]]; then
  echo "extension directory not found: ${EXT_DIR}" >&2
  exit 1
fi

UUID="$(python - <<'PY'
import json, pathlib
path = pathlib.Path("extension/metadata.json")
data = json.loads(path.read_text())
print(data.get("uuid", "extension"))
PY
)"

mkdir -p "${DIST_DIR}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

cp -R "${EXT_DIR}/." "${TMP_DIR}/"
rm -f "${TMP_DIR}/schemas/gschemas.compiled"
if [[ -d "${TMP_DIR}/schemas" ]]; then
  glib-compile-schemas "${TMP_DIR}/schemas"
fi

ZIP_PATH="${DIST_DIR}/${UUID}.zip"
(
  cd "${TMP_DIR}"
  zip -r "${ZIP_PATH}" .
)

echo "Wrote ${ZIP_PATH}"
