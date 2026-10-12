#!/bin/bash
# marketing/redes/rellenar-cola.sh — sesión 13: Buffer gratis solo admite 10 publicaciones programadas.
# Cron lo llama cada 10 min: mantiene en Buffer las 10 aprobadas más próximas (buffer.mjs rellenar) y sube sus vídeos.
# Registro en salida/cola.log. Quitar el cron: crontab -e y borrar la línea de rellenar-cola.sh.
cd "$(dirname "$0")/../.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
exec 9>/tmp/nokfi-cola.lock; flock -n 9 || exit 0
echo "$(date '+%F %H:%M') $(node marketing/redes/buffer.mjs rellenar 2>&1 | tail -6 | tr '\n' ' ')" >> marketing/redes/salida/cola.log
