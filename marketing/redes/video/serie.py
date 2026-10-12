"""marketing/redes/video/serie.py — sesión 13: produce vídeos en serie y los deja en la cola de publicación.

Uso (desde la raíz del repo):  python3 marketing/redes/video/serie.py <id> [<id> …]   [--sin-cola]
Por cada guion: voz → revisión automática del audio (hasta 3 tomas por frase) → tarjetas → montaje →
hoja de contactos (salida/_hojas/<id>.png) → hueco en publicaciones/2026-serie-100.json (una cada 4-5 horas).
Un vídeo cuyo audio no pasa la revisión NO entra en la cola: queda anotado en salida/serie.log como DUDOSO.
"""
import datetime, json, os, signal, subprocess, sys, time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
V = os.path.join(RAIZ, 'marketing/redes/video')
SALIDA = os.path.join(RAIZ, 'marketing/redes/salida')
PUB = os.path.join(RAIZ, 'marketing/redes/publicaciones')
COLA = os.path.join(PUB, '2026-serie-100.json')
ENV = dict(os.environ, OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', MKL_NUM_THREADS='2', PLAYWRIGHT_CORE=os.path.realpath(os.path.join(RAIZ, '../n8n-nodes-nokfi/node_modules/playwright-core')))


def temperatura():
    """Temperatura más alta del equipo (°C), según /sys/class/thermal."""
    t = 0
    for z in os.listdir('/sys/class/thermal'):
        try: t = max(t, int(open(f'/sys/class/thermal/{z}/temp').read()) / 1000)
        except Exception: pass
    return t


def enfriar(objetivo=62, tope=900):
    """Espera a que el equipo baje de temperatura (el portátil del usuario se apaga si se calienta)."""
    t0 = time.time()
    while temperatura() > objetivo and time.time() - t0 < tope:
        time.sleep(5)


def run(*a, **k):
    # Cada orden pesada se PAUSA (SIGSTOP) si el equipo pasa de 70 °C y sigue al bajar de 60 °C.
    enfriar(66)
    p = subprocess.Popen(a, cwd=RAIZ, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True, **k)
    import threading
    salida = []
    hilo = threading.Thread(target=lambda: salida.append(p.stdout.read()), daemon=True); hilo.start()
    parado = False
    while p.poll() is None:
        t = temperatura()
        if not parado and t >= 70: os.killpg(p.pid, signal.SIGSTOP); parado = True
        elif parado and t <= 60: os.killpg(p.pid, signal.SIGCONT); parado = False
        time.sleep(2)
    hilo.join(5)
    return ''.join(salida).strip()


def log(msg):
    linea = f"{datetime.datetime.now():%H:%M:%S} {msg}"
    print(linea, flush=True)
    open(os.path.join(SALIDA, 'serie.log'), 'a').write(linea + '\n')


def hueco():
    """Siguiente hueco libre: una publicación cada 4-5 horas (9:00, 13:30, 18:00 y 22:30), a petición del usuario."""
    usados = set()
    for n in os.listdir(PUB):
        if n.endswith('.json'):
            usados |= {x['cuando'] for x in json.load(open(os.path.join(PUB, n)))}
    dia = datetime.date.today()
    limite = (datetime.datetime.now() + datetime.timedelta(minutes=20)).strftime('%Y-%m-%dT%H:%M')
    while True:
        for h in ('09:00', '13:30', '18:00', '22:30'):
            c = f'{dia}T{h}'
            if c > limite and c not in usados: return c
        dia += datetime.timedelta(days=1)


def producir(vid, encolar=True):
    gp = os.path.join(V, 'guiones', vid + '.json')
    g = json.load(open(gp))
    if encolar and os.path.exists(COLA) and any(x['pieza'] == vid for x in json.load(open(COLA))): return   # ya hecho (reanudación tras un corte)
    estado = 'OK'
    if not g.get('sinVoz'):
        out = run('node', 'marketing/redes/video/voz.mjs', gp, '--forzar')
        if '✓' not in out: return log(f'{vid} FALLO voz: {out[-200:]}')
        for intento in range(4):
            r = run(os.path.join(V, '.asr/bin/python'), os.path.join(V, 'revisa_audio.py'), vid).splitlines()[-1]
            if r.endswith(' OK'): break
            if intento == 3 or ' MAL ' not in r: estado = 'DUDOSO'; break
            run('node', 'marketing/redes/video/voz.mjs', gp, '--repetir', r.split(' MAL ')[1])
        if estado == 'DUDOSO':
            rev = json.load(open(os.path.join(V, 'voz', vid + '.revision.json')))
            malas = [f"{f['n']}:{f['parecido']}/{f['ritmo']}/{f['hueco']} «{f['oido'][:60]}»" for f in rev['frases'] if not f['ok']]
            log(f'{vid} DUDOSO audio → {" | ".join(malas)}')
    if any(e.get('tarjeta') for e in g['escenas']):
        out = run('node', 'marketing/redes/video/tarjetas.mjs', gp)
        if '✓' not in out: return log(f'{vid} FALLO tarjetas: {out[-200:]}')
    out = run('node', 'marketing/redes/video/montar.mjs', gp)
    video = os.path.join(SALIDA, vid, 'video.mp4')
    if '✓' not in out or not os.path.exists(video): return log(f'{vid} FALLO montaje: {out[-300:]}')
    dur = float(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video) or 0)
    os.makedirs(os.path.join(SALIDA, '_hojas'), exist_ok=True)
    run('ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', f'fps=6/{max(dur, 1):.2f},scale=216:-2,tile=6x1', '-frames:v', '1', os.path.join(SALIDA, '_hojas', vid + '.png'))
    if estado != 'OK' or dur < 6:
        open(os.path.join(SALIDA, 'serie-dudosos.txt'), 'a').write(vid + '\n')
        return log(f'{vid} {estado} · {dur:.1f} s · NO entra en la cola')
    if encolar:
        import fcntl
        with open('/tmp/nokfi-serie.lock', 'w') as cerrojo:   # varios procesos de serie.py a la vez no se pisan el hueco
            fcntl.flock(cerrojo, fcntl.LOCK_EX)
            cola = json.load(open(COLA)) if os.path.exists(COLA) else []
            if not any(x['pieza'] == vid for x in cola):
                cola.append({'id': vid + '-tt', 'red': 'tiktok', 'cuando': hueco(), 'pieza': vid, 'video': 'video.mp4', 'titulo': g['titulo'],
                             'ia': not g.get('sinVoz', False), 'texto': g['texto'], 'aprobado': True})
                json.dump(cola, open(COLA, 'w'), ensure_ascii=False, indent=1)
        log(f"{vid} OK · {dur:.1f} s · cola {[x['cuando'] for x in cola if x['pieza'] == vid][0]}")
        subprocess.Popen(['bash', os.path.join(RAIZ, 'marketing/redes/rellenar-cola.sh')])
    else:
        log(f'{vid} OK · {dur:.1f} s')


if __name__ == '__main__':
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    for vid in ids:
        try: producir(vid, '--sin-cola' not in sys.argv)
        except Exception as e: log(f'{vid} ERROR {e}')
        time.sleep(30); enfriar(60)   # descanso entre vídeos
    if '--sin-cola' not in sys.argv: log('cola: ' + run('node', 'marketing/redes/buffer.mjs', 'rellenar').replace('\n', ' · ')[-300:])
