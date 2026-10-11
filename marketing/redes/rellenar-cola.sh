#!/bin/bash
# marketing/redes/rellenar-cola.sh — sesión 13: Buffer gratis solo admite 10 publicaciones programadas.
# Este guion (lo llama cron cada 20 min) envía las aprobadas que aún no caben, según se van publicando las anteriores.
# Uso: rellenar-cola.sh [publicaciones/<archivo>.json …]   (por defecto, 2026-cola-horaria.json)
# Quitar el cron: crontab -e y borrar la línea de rellenar-cola.sh.
cd "$(dirname "$0")/../.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
for f in "${@:-marketing/redes/publicaciones/2026-cola-horaria.json}"; do
  grep -q '"aprobado": true' "$f" || continue
  echo "$(date '+%F %H:%M') $(node marketing/redes/buffer.mjs programar "$f" 2>&1 | tail -3 | tr '\n' ' ')"
done >> marketing/redes/salida/cola.log
