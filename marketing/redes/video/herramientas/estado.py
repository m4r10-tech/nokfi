"""marketing/redes/video/herramientas/estado.py — sesión 13: tablero de la producción de vídeos.

Recorre guiones/, voz/, salida/ y buffer/publicaciones/ y escribe marketing/redes/docs/ESTADO.md: en qué paso está cada
vídeo y qué le falta. No toca nada más ni llama a Buffer.

Uso (desde la raíz del repo):  python3 marketing/redes/video/herramientas/estado.py
"""
import datetime, glob, json, os

V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # marketing/redes/video
REDES = os.path.dirname(V)
SALIDA = os.path.join(REDES, 'salida')
ahora = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M')

cola = {}
for f in glob.glob(os.path.join(REDES, 'buffer', 'publicaciones', '*.json')):
    for x in json.load(open(f)):
        if x.get('red') == 'tiktok' and x.get('pieza'): cola[x['pieza']] = x
lote = {}
lj = os.path.join(SALIDA, 'lotes-voz', 'lotes.json')
if os.path.exists(lj):
    for nombre, videos in json.load(open(lj)).items():
        for v in videos: lote[v['id']] = nombre

filas, cuenta = [], {}
for gp in sorted(glob.glob(os.path.join(V, 'guiones', 'v*.json'))):
    vid = os.path.basename(gp)[:-5]
    g = json.load(open(gp))
    wav = os.path.join(V, 'voz', vid + '.wav')
    ext = os.path.join(V, 'voz', vid + '.externa.json')
    rev = os.path.join(V, 'voz', vid + '.revision.json')
    mp4 = os.path.join(SALIDA, vid, 'video.mp4')
    pub = cola.get(vid)
    publicado = bool(pub and pub.get('buffer_id') and pub['cuando'] <= ahora)
    voz = 'nueva' if os.path.exists(ext) else 'antigua' if os.path.exists(wav) else '—'
    audio = '—'
    if os.path.exists(rev) and os.path.exists(wav) and os.path.getmtime(rev) >= os.path.getmtime(wav):
        audio = 'OK' if json.load(open(rev))['ok'] else 'REVISAR'
    montado = '—'
    if os.path.exists(mp4):
        montado = 'voz nueva' if os.path.exists(ext) and os.path.getmtime(mp4) > os.path.getmtime(ext) else 'voz antigua'
    if publicado: paso = 'publicado'
    elif montado == 'voz nueva' and audio == 'OK': paso = 'listo para tu visto bueno'
    elif voz == 'nueva': paso = 'falta montar'
    elif vid in lote: paso = f'falta tu audio ({lote[vid]})'
    else: paso = 'falta voz'
    cuenta[paso.split(' (')[0]] = cuenta.get(paso.split(' (')[0], 0) + 1
    cuando = pub['cuando'].replace('T', ' ') if pub else ''
    filas.append(f"| {vid} | {g.get('metodo', '')[:38]} | {voz} | {audio} | {montado} | {cuando if publicado else ''} | {paso} |")

with open(os.path.join(REDES, 'docs', 'ESTADO.md'), 'w') as f:
    f.write(f"# Estado de la producción de vídeos\n\n> Generado por `estado.py` el {ahora.replace('T', ' ')}. No editar a mano: se sobrescribe.\n\n")
    f.write(f"**{len(filas)} guiones** · " + ' · '.join(f'{n} {k}' for k, n in sorted(cuenta.items(), key=lambda x: -x[1])) + '\n\n')
    f.write('«Publicado» sale de lo que se envió a Buffer con fecha ya pasada; lo que se publique a mano no aparece aquí.\n\n')
    f.write('| Vídeo | Formato | Voz | Audio | Montado con | Publicado | Siguiente paso |\n|---|---|---|---|---|---|---|\n' + '\n'.join(filas) + '\n')
print(len(filas), 'guiones ·', cuenta)
