#!/bin/bash
# marketing/redes/video/continuar-serie.sh — sesión 13: sigue produciendo, DESPACIO, los vídeos de la serie que falten.
# Lo llama cron (cada 30 min y al arrancar): si ya hay una producción en marcha no hace nada. Usa solo 2 núcleos,
# prioridad mínima y se pausa sola si el equipo se calienta (serie.py). Quitar: crontab -e y borrar la línea.
cd "$(dirname "$0")/../../.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
[ -f marketing/redes/salida/SERIE-EN-PAUSA ] && exit 0   # pausa manual: borrar ese archivo para seguir
exec 8>/tmp/nokfi-serie-produccion.lock; flock -n 8 || exit 0
IDS=$(python3 - <<'PY'
import glob, json, os
hechos = {x['pieza'] for x in json.load(open('marketing/redes/publicaciones/2026-serie-100.json'))}
dud = set(open('marketing/redes/salida/serie-dudosos.txt').read().split()) if os.path.exists('marketing/redes/salida/serie-dudosos.txt') else set()
ids = sorted(os.path.basename(f)[:-5] for f in glob.glob('marketing/redes/video/guiones/v*.json'))
ids = [i for i in ids if 25 <= int(i[1:4]) <= 124 and i not in hechos and i not in dud]
g = {}
for i in ids: g.setdefault((int(i[1:4]) - 25) // 5, []).append(i)
print(' '.join(g[k][r] for r in range(5) for k in sorted(g) if r < len(g[k])))
PY
)
[ -z "$IDS" ] && exit 0
taskset -c 0,1 nice -n 19 ionice -c 3 python3 marketing/redes/video/serie.py $IDS >> marketing/redes/salida/serie-produccion.out 2>&1
