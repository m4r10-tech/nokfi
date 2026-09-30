#!/usr/bin/env bash
# Copia integrations/n8n al repositorio PÚBLICO del nodo (../n8n-nodes-nokfi)
# sin node_modules ni dist. El código fuente vive aquí; allí solo llegan
# instantáneas limpias (sin el historial privado de Nokfi).
#
# Uso:  integrations/sync-n8n-node.sh "Mensaje del commit"
# Después, en ../n8n-nodes-nokfi: revisar, `npm version patch|minor` y
# `git push --follow-tags` → GitHub Actions publica en npm con provenance.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/n8n" && pwd)"
DST="$(cd "$(dirname "$0")/../.." && pwd)/n8n-nodes-nokfi"
[ -d "$DST/.git" ] || { echo "No existe $DST (clona allí el repo público)"; exit 1; }
rsync -a --delete --exclude .git --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' --exclude CHANGELOG.md "$SRC/" "$DST/"
cd "$DST" && git add -A && git status --short
if [ -n "${1:-}" ]; then git commit -m "$1"; else echo "Revisa los cambios y haz commit en $DST"; fi
