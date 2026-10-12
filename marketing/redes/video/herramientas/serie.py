"""marketing/redes/video/herramientas/serie.py — sesión 13: monta vídeos en serie, despacio y sin calentar el equipo.

Uso (desde la raíz del repo):  python3 marketing/redes/video/herramientas/serie.py <id> [<id> …]
Por cada guion con voz ya cortada (partir_audio.py): revisión automática del audio → tarjetas → montaje →
hoja de contactos (salida/_hojas/<id>.png). No programa ni publica nada (ver docs/PRODUCCION.md).
Un vídeo cuyo audio no pasa la revisión queda anotado como DUDOSO en salida/_control/serie-dudosos.txt.
"""
import datetime, json, os, signal, subprocess, sys, time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
V = os.path.join(RAIZ, 'marketing/redes/video')
SALIDA = os.path.join(RAIZ, 'marketing/redes/salida')
H = os.path.join(V, 'herramientas')
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
    open(os.path.join(SALIDA, '_registro', 'serie.log'), 'a').write(linea + '\n')


def producir(vid):
    gp = os.path.join(V, 'guiones', vid + '.json')
    g = json.load(open(gp))
    if not os.path.exists(os.path.join(V, 'voz', vid + '.externa.json')):
        return log(f'{vid} SIN VOZ: falta cortar su audio con partir_audio.py')
    estado = 'OK'
    r = run(os.path.join(V, '.asr/bin/python'), os.path.join(H, 'revisa_audio.py'), vid).splitlines()[-1]
    if not r.endswith(' OK'):
        estado = 'DUDOSO'
        rev = json.load(open(os.path.join(V, 'voz', vid + '.revision.json')))
        log(f'{vid} DUDOSO audio → ' + ' | '.join(f"{f['n']}:{f['parecido']}/{f['ritmo']}/{f['hueco']} «{f['oido'][:60]}»" for f in rev['frases'] if not f['ok']))
    if any(e.get('tarjeta') for e in g['escenas']):
        out = run('node', os.path.join(H, 'tarjetas.mjs'), gp)
        if '✓' not in out: return log(f'{vid} FALLO tarjetas: {out[-200:]}')
    out = run('node', os.path.join(H, 'montar.mjs'), gp)
    video = os.path.join(SALIDA, vid, 'video.mp4')
    if '✓' not in out or not os.path.exists(video): return log(f'{vid} FALLO montaje: {out[-300:]}')
    dur = float(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video) or 0)
    os.makedirs(os.path.join(SALIDA, '_hojas'), exist_ok=True)
    run('ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', f'fps=6/{max(dur, 1):.2f},scale=216:-2,tile=6x1', '-frames:v', '1', os.path.join(SALIDA, '_hojas', vid + '.png'))
    if estado != 'OK' or dur < 6:
        open(os.path.join(SALIDA, '_control', 'serie-dudosos.txt'), 'a').write(vid + '\n')
        return log(f'{vid} {estado} · {dur:.1f} s · hay que revisarlo')
    log(f'{vid} OK · {dur:.1f} s')


if __name__ == '__main__':
    for vid in [a for a in sys.argv[1:] if not a.startswith('--')]:
        try: producir(vid)
        except Exception as e: log(f'{vid} ERROR {e}')
        time.sleep(30); enfriar(60)   # descanso entre vídeos
