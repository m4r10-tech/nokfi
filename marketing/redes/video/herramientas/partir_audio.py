"""marketing/redes/video/herramientas/partir_audio.py — sesión 13: parte un audio largo locutado FUERA (ElevenLabs) en la voz de cada vídeo.

Cada lote es una carpeta marketing/redes/salida/lotes-voz/<lote>/ con texto.txt (lo que se pega en ElevenLabs) y el
audio que deja el usuario dentro (cualquier nombre: .mp3, .wav, .m4a…). Este guion lo transcribe con Whisper (marcas
de tiempo por palabra), lo alinea con el texto del lote y saca, por vídeo:
  voz/<id>.wav · voz/<id>.tiempos.json (frases, tiempos y palabras) · voz/<id>.externa.json (calidad de la alineación)
  voz/<id>/NN.wav + voz/<id>/frases.json  (cada frase por separado, para poder sustituir una sola con --retoque)

Uso (venv .asr, desde la raíz del repo):
  …/.asr/bin/python …/partir_audio.py <lote> [/ruta/al/audio] [--tempo 1] [--prueba]
  …/.asr/bin/python …/partir_audio.py --retoque <id> <nº de frase, desde 1> <audio con esa frase sola> ["texto nuevo"]

Cómo se corta (lecciones del 2026-10-12, ver docs/metodo/11-LECCIONES.md):
- El final de cada frase se busca por energía, no por la marca de Whisper, y se dejan 90 ms de cola: las últimas
  sílabas suaves («veinte», «tres») se pierden si se recorta a −45 dB.
- Cada trozo entra y sale con un fundido corto; nunca un corte en seco.
- Entre frases se respeta la pausa que hizo el locutor, acotada entre 0,28 y 0,50 s.
- Si el locutor NO hizo pausa entre dos líneas (las dijo de corrido), no se inventa: se dejan pegadas, tal cual sonaron.
  Meter ahí un silencio se oye como un corte raro.
- Tras «:» tiene que haber pausa: si el locutor no la hizo (menos de 0,15 s), se abre una de 0,24 s en el punto más silencioso.
Una frase con menos del 80 % de palabras reconocidas deja el vídeo marcado como DUDOSO. --prueba solo informa.
"""
import difflib
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from revisa_audio import normal  # misma normalización que la revisión de audio

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # marketing/redes/video
DIR_LOTES = os.path.join(HERE, '../salida/lotes-voz')
LOTES = os.path.join(DIR_LOTES, '_indice/lotes.json')   # qué vídeos y frases lleva cada lote
SR = 44100
TEMPO = 1.0            # 1 = tal cual se locutó; como mucho 1.06
PAUSA_MIN, PAUSA_MAX = 0.28, 0.50
COLA, CABEZA = 0.09, 0.05          # silencio que se conserva tras la última sílaba y antes de la primera
DOS_PUNTOS_MIN, DOS_PUNTOS = 0.15, 0.24
UMBRAL = 10 ** (-52 / 20)          # por debajo de esto, silencio


def cargar(audio):
    return np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout, dtype=np.float32)


def energia(pcm):
    """Pico de cada ventana de 10 ms."""
    n = len(pcm) // 160
    return np.abs(pcm[:n * 160]).reshape(n, 160).max(axis=1)


def fin_de_habla(e, t, tope):
    """Desde t (s), el primer instante en que hay 60 ms seguidos de silencio; nunca más allá de `tope`."""
    k, kt = int(t * 100), int(tope * 100)
    while k + 6 <= kt and e[k:k + 6].max() >= UMBRAL: k += 1
    return min(k / 100, tope)


def inicio_de_habla(e, t, tope):
    """Hacia atrás desde t, el último instante con 60 ms seguidos de silencio antes de la voz; nunca antes de `tope`."""
    k, kt = int(t * 100), int(tope * 100)
    while k - 6 >= kt and e[k - 6:k].max() >= UMBRAL: k -= 1
    return max(k / 100, tope)


def mas_silencioso(e, a, b):
    if b - a < 0.03: return (a + b) / 2
    k0 = int(a * 100); seg = e[k0:int(b * 100)]
    return (k0 + int(np.argmin(np.convolve(seg, np.ones(3) / 3, mode='same'))) + 0.5) / 100 if len(seg) else (a + b) / 2


def transcribir(modelo, pcm):
    segs, _ = modelo.transcribe(pcm, language='es', beam_size=3, word_timestamps=True, condition_on_previous_text=False)
    return [(w.start, w.end, w.word.strip()) for sg in segs for w in (sg.words or [])]


def alinear(frases, crudas):
    """Tiempo (inicio, fin) de cada token esperado, o None; y, por frase, el índice de token de cada palabra que acaba en «:»."""
    oido = [(tok, a, b) for (a, b, w) in crudas for tok in normal(w)]
    esperado, dos = [], []
    for fi, f in enumerate(frases):
        toks = normal(f); base = len(esperado)
        esperado += [(tok, fi) for tok in toks]
        por_palabra = [len(normal(w)) for w in f.split()]
        marcas = []
        if sum(por_palabra) == len(toks):
            c = 0
            for w, n in zip(f.split(), por_palabra):
                c += n
                if w.endswith(':') and n: marcas.append(base + c - 1)
        dos.append(marcas)
    sm = difflib.SequenceMatcher(None, [x[0] for x in esperado], [o[0] for o in oido], autojunk=False)
    tiempo = [None] * len(esperado)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): tiempo[blk.a + k] = (oido[blk.b + k][1], oido[blk.b + k][2])
    return esperado, tiempo, dos


def trozo(audio, a, b, destino, tempo, cortes=(), f_in=0.012, f_out=0.03):
    """Corta [a, b] del audio con fundidos; `cortes` = [(instante, segundos de silencio a insertar)] dentro del trozo."""
    puntos = [a] + [c for c, _ in cortes] + [b]
    filtros, etiquetas = [], []
    for i in range(len(puntos) - 1):
        d = puntos[i + 1] - puntos[i]
        filtros.append(f"[0:a]atrim={puntos[i]:.3f}:{puntos[i + 1]:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={f_in if i == 0 else 0.012},afade=t=out:st={max(0, d - (f_out if i == len(puntos) - 2 else 0.03)):.3f}:d={f_out if i == len(puntos) - 2 else 0.03}[p{i}]")
        etiquetas.append(f'[p{i}]')
        if i < len(cortes):
            filtros.append(f"anullsrc=r={SR}:cl=mono,atrim=0:{cortes[i][1]:.3f}[s{i}]"); etiquetas.append(f'[s{i}]')
    filtros.append(f"{''.join(etiquetas)}concat=n={len(etiquetas)}:v=0:a=1,atempo={tempo}[o]")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', audio, '-filter_complex', ';'.join(filtros), '-map', '[o]', '-ar', str(SR), '-ac', '1', destino], check=True)
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', destino], capture_output=True, text=True).stdout or 0)


def frase_a_trozo(audio, e, crudas, ini, fin, limite_a, limite_b, marcas_dos, tiempo, destino, tempo, pegada_a=False, pegada_b=False):
    """Guarda una frase como trozo suelto. Devuelve { dur, palabras (relativas al trozo) }."""
    # «Pegada»: el locutor no hizo pausa con la frase vecina; se corta justo en el límite, sin recortar ni fundir.
    a = limite_a if pegada_a else max(limite_a, inicio_de_habla(e, ini, limite_a) - CABEZA)
    b = limite_b if pegada_b else min(limite_b, fin_de_habla(e, fin, limite_b) + COLA)
    cortes = []
    for j in marcas_dos:   # pausa tras «:»
        if tiempo[j] and j + 1 < len(tiempo) and tiempo[j + 1] and a < tiempo[j][1] < b:
            hueco = tiempo[j + 1][0] - tiempo[j][1]
            if hueco < DOS_PUNTOS_MIN: cortes.append((mas_silencioso(e, tiempo[j][1] - 0.02, tiempo[j + 1][0] + 0.04), DOS_PUNTOS))
    dur = trozo(audio, a, b, destino, tempo, cortes, 0.002 if pegada_a else 0.012, 0.002 if pegada_b else 0.03)
    def t_out(t): return (t - a + sum(d for c, d in cortes if c <= t)) / tempo
    pal = [[round(max(0, t_out(s)), 3), round(min(dur, t_out(f)), 3), w] for (s, f, w) in crudas if a <= (s + f) / 2 < b]
    return {'dur': round(dur, 3), 'palabras': pal, 'pausas_abiertas': len(cortes)}


def componer(vid):
    """Une los trozos de voz/<vid>/ con sus pausas y escribe voz/<vid>.wav y voz/<vid>.tiempos.json."""
    d = os.path.join(HERE, 'voz', vid)
    F = json.load(open(os.path.join(d, 'frases.json')))
    filtros, etiquetas, tiempos, palabras, t = [], [], [], [], 0.0
    ent = []
    for k, fr in enumerate(F['frases']):
        ent += ['-i', os.path.join(d, f'{k + 1:02d}.wav')]
        if k and fr['pausa'] > 0:
            filtros.append(f"anullsrc=r={SR}:cl=mono,atrim=0:{fr['pausa']:.3f}[s{k}]"); etiquetas.append(f'[s{k}]'); t += fr['pausa']
        etiquetas.append(f'[{k}:a]')
        tiempos.append([round(t, 3), round(t + fr['dur'], 3)])
        palabras.append([[round(t + s, 3), round(t + f, 3), w] for s, f, w in fr['palabras']])
        t += fr['dur']
    filtros.append(f"{''.join(etiquetas)}concat=n={len(etiquetas)}:v=0:a=1[o]")
    destino = os.path.join(HERE, 'voz', vid + '.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ent, '-filter_complex', ';'.join(filtros), '-map', '[o]', '-ar', str(SR), '-ac', '1', '-c:a', 'pcm_s16le', destino], check=True)
    json.dump({'frases': [fr['texto'] for fr in F['frases']], 'tiempos': tiempos, 'palabras': palabras}, open(destino.replace('.wav', '.tiempos.json'), 'w'), ensure_ascii=False, indent=1)
    return t


def retoque():
    """Sustituye una sola frase de un vídeo por un audio nuevo (y, si se da, por un texto nuevo)."""
    i = sys.argv.index('--retoque')
    vid, n, audio = sys.argv[i + 1], int(sys.argv[i + 2]), sys.argv[i + 3]
    d = os.path.join(HERE, 'voz', vid)
    F = json.load(open(os.path.join(d, 'frases.json')))
    texto = sys.argv[i + 4] if len(sys.argv) > i + 4 and not sys.argv[i + 4].startswith('--') else F['frases'][n - 1]['texto']
    tempo = float(sys.argv[sys.argv.index('--tempo') + 1]) if '--tempo' in sys.argv else F.get('tempo', TEMPO)
    pcm = cargar(audio); e = energia(pcm); total = len(pcm) / 16000
    modelo = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=2)
    crudas = transcribir(modelo, pcm)
    esperado, tiempo, dos = alinear([texto], crudas)
    ts = [x for x in tiempo if x]
    ok = len(ts) / max(1, len(esperado))
    if not ts or ok < 0.8: sys.exit(f'{vid} frase {n}: solo se reconoce el {ok:.0%} de «{texto}» en ese audio. No se cambia nada.')
    r = frase_a_trozo(audio, e, crudas, ts[0][0], ts[-1][1], 0.0, total, dos[0], tiempo, os.path.join(d, f'{n:02d}.wav'), tempo)
    F['frases'][n - 1].update(texto=texto, dur=r['dur'], palabras=r['palabras'], reconocido=round(ok, 2), retocada=True)
    json.dump(F, open(os.path.join(d, 'frases.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{vid} frase {n} sustituida ({ok:.0%} reconocido) · voz de {componer(vid):.1f} s')


def main():
    if '--retoque' in sys.argv: return retoque()
    lote = sys.argv[1]
    audio = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
    if not audio:   # sin ruta: el audio que haya dentro de la carpeta del lote
        hay = sorted(f for f in os.listdir(os.path.join(DIR_LOTES, lote)) if f.lower().endswith(('.mp3', '.wav', '.m4a', '.mpeg', '.ogg', '.flac')))
        if len(hay) != 1: sys.exit(f"En lotes-voz/{lote}/ hay {len(hay)} audios ({', '.join(hay) or 'ninguno'}): tiene que haber exactamente uno.")
        audio = os.path.join(DIR_LOTES, lote, hay[0])
    prueba = '--prueba' in sys.argv
    tempo = float(sys.argv[sys.argv.index('--tempo') + 1]) if '--tempo' in sys.argv else TEMPO
    videos = json.load(open(LOTES))[lote]
    pcm = cargar(audio); e = energia(pcm); total = len(pcm) / 16000
    modelo = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=2)
    crudas = transcribir(modelo, pcm)
    todas = [f for v in videos for f in v['frases']]
    esperado, tiempo, dos = alinear(todas, crudas)
    # Límites de habla de cada frase por sus palabras reconocidas.
    L, i = [], 0
    for f in todas:
        n = len(normal(f)); ts = [x for x in tiempo[i:i + n] if x]
        L.append({'ini': ts[0][0] if ts else None, 'fin': ts[-1][1] if ts else None, 'ok': len(ts) / max(1, n),
                  'sin_cabeza': bool(ts) and not tiempo[i], 'sin_cola': bool(ts) and not tiempo[i + n - 1]})
        i += n
    for k, fr in enumerate(L):   # frases sin ninguna palabra reconocida: el hueco entre sus vecinas
        if fr['ini'] is None:
            fr['ini'] = next((L[j]['fin'] for j in range(k - 1, -1, -1) if L[j]['fin'] is not None), 0)
            fr['fin'] = next((L[j]['ini'] for j in range(k + 1, len(L)) if L[j]['ini'] is not None), total)
    # Whisper a veces se salta una frase entera (o su principio o su final) en la pasada larga. Cada tramo
    # con frases flojas se vuelve a escuchar él solo, entre la frase buena de antes y la de después, y se
    # realinea; se queda la lectura nueva si reconoce más palabras.
    flojas = [fr['ok'] < 0.8 or fr['sin_cabeza'] or fr['sin_cola'] for fr in L]
    k = 0
    while k < len(L):
        if not flojas[k]: k += 1; continue
        j = k
        while j + 1 < len(L) and flojas[j + 1]: j += 1
        t0 = L[k - 1]['fin'] if k else 0.0
        t1 = L[j + 1]['ini'] if j + 1 < len(L) else total
        if t1 - t0 > 0.3:
            locales = [(a + t0, b + t0, w) for a, b, w in transcribir(modelo, pcm[int(t0 * 16000):int(t1 * 16000)])]
            _, t2, _ = alinear(todas[k:j + 1], locales)
            n_viejo = sum(len(normal(f)) * L[q]['ok'] for q, f in zip(range(k, j + 1), todas[k:j + 1]))
            if sum(1 for x in t2 if x) > n_viejo + 0.5:
                i0 = sum(len(normal(f)) for f in todas[:k]); i2 = 0
                for q in range(k, j + 1):
                    n = len(normal(todas[q])); ts = [x for x in t2[i2:i2 + n] if x]
                    if ts: L[q].update(ini=ts[0][0], fin=ts[-1][1], ok=len(ts) / max(1, n))
                    tiempo[i0 + i2:i0 + i2 + n] = t2[i2:i2 + n]; i2 += n
                crudas = sorted([c for c in crudas if not (t0 <= (c[0] + c[1]) / 2 < t1)] + locales)
        k = j + 1
    medio = [0.0] + [mas_silencioso(e, min(L[k]['fin'], L[k + 1]['ini']), max(L[k]['fin'], L[k + 1]['ini'])) for k in range(len(L) - 1)] + [total]
    # ¿Hay silencio de verdad entre cada frase y la siguiente? (al menos 100 ms seguidos por debajo del umbral)
    def silencio(k):
        seg = e[int(max(0, L[k]['fin'] - 0.05) * 100):int((L[k + 1]['ini'] + 0.05) * 100)] < UMBRAL
        mejor = run = 0
        for x in seg:
            run = run + 1 if x else 0; mejor = max(mejor, run)
        return mejor / 100
    pegada = [silencio(k) < 0.10 for k in range(len(L) - 1)]   # pegada[k]: la frase k va de corrido con la k+1
    g = 0
    for v in videos:
        ks = list(range(g, g + len(v['frases']))); g += len(v['frases'])
        peor = min(L[k]['ok'] for k in ks)
        estado = 'OK' if peor >= 0.8 else 'DUDOSO'
        if prueba:
            print(f"{v['id']} {estado} · peor frase {peor:.2f} · {L[ks[0]]['ini']:.1f}-{L[ks[-1]]['fin']:.1f} s", flush=True); continue
        d = os.path.join(HERE, 'voz', v['id'])
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        F, abiertas = [], 0
        for n, k in enumerate(ks):
            pa, pb = bool(n) and pegada[k - 1], n < len(ks) - 1 and pegada[k]
            r = frase_a_trozo(audio, e, crudas, L[k]['ini'], L[k]['fin'], medio[k], medio[k + 1], dos[k], tiempo, os.path.join(d, f'{n + 1:02d}.wav'), tempo, pa, pb)
            natural = (L[k]['ini'] - L[k - 1]['fin']) if n else 0
            F.append({'texto': v['frases'][n], 'dur': r['dur'], 'palabras': r['palabras'], 'reconocido': round(L[k]['ok'], 2),
                      'pausa': 0 if (not n or pa) else round(max(0.05, min(PAUSA_MAX, max(PAUSA_MIN, natural)) - COLA - CABEZA), 3), 'pegada_a_la_anterior': pa})
            abiertas += r['pausas_abiertas']
        json.dump({'lote': lote, 'tempo': tempo, 'frases': F}, open(os.path.join(d, 'frases.json'), 'w'), ensure_ascii=False, indent=1)
        dur = componer(v['id'])
        json.dump({'lote': lote, 'estado': estado, 'frases': [{'n': n + 1, 'reconocido': f['reconocido']} for n, f in enumerate(F)]},
                  open(os.path.join(HERE, 'voz', v['id'] + '.externa.json'), 'w'), ensure_ascii=False, indent=1)
        pegs = [n + 1 for n, f in enumerate(F) if f['pegada_a_la_anterior']]
        print(f"{v['id']} {estado} · peor frase {peor:.2f} · voz de {dur:.1f} s" + (f' · {abiertas} pausa(s) abierta(s) tras «:»' if abiertas else '') + (f' · sin pausa antes de la(s) frase(s) {pegs}' if pegs else ''), flush=True)


if __name__ == '__main__':
    main()
