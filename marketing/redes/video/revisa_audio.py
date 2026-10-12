"""marketing/redes/video/revisa_audio.py — sesión 13: revisión automática de la locución antes de publicar.

Como nadie escucha cada vídeo, un reconocedor de voz local (Whisper, gratis) transcribe cada frase
locutada y se compara con lo que debía decir. También se mide el ritmo y los silencios raros.

Uso (venv .asr):  .asr/bin/python revisa_audio.py <id> [<id> …]
Lee voz/<id>.wav y voz/<id>.tiempos.json; escribe voz/<id>.revision.json y, por stdout, una línea por vídeo:
  <id> OK            |  <id> MAL 3,5   (números de frase, desde 1, que hay que repetir con voz.mjs --repetir)
Una frase falla si lo oído se parece poco a lo escrito, si va muy lenta o muy rápida, o si tiene un hueco largo.
"""
import difflib
import json
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
UMBRAL, RITMO_MIN, RITMO_MAX, HUECO_MAX = 0.80, 10.5, 22.0, 0.60

U = 'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte'.split()
D = {30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa'}
C = {1: 'ciento', 2: 'doscientos', 3: 'trescientos', 4: 'cuatrocientos', 5: 'quinientos', 6: 'seiscientos', 7: 'setecientos', 8: 'ochocientos', 9: 'novecientos'}


def numero(n):
    """Entero → palabras (sin tildes), suficiente para comparar con lo oído."""
    if n <= 20: return U[n]
    if n < 30: return 'veinti' + U[n - 20]
    if n < 100: return D[n // 10 * 10] + (' y ' + U[n % 10] if n % 10 else '')
    if n == 100: return 'cien'
    if n < 1000: return C[n // 100] + (' ' + numero(n % 100) if n % 100 else '')
    if n < 1000000: return ('mil' if n // 1000 == 1 else numero(n // 1000) + ' mil') + (' ' + numero(n % 1000) if n % 1000 else '')
    return str(n)


def normal(s):
    s = s.lower().replace('|', ' ').replace('%', ' por ciento ').replace('€', ' euros ')
    s = re.sub(r'(\d)\.(\d{3})\b', r'\1\2', s)                 # 1.200 → 1200
    s = re.sub(r'(\d+),(\d+)', lambda m: f'{numero(int(m[1]))} con {numero(int(m[2]))}', s)
    s = re.sub(r'\d+', lambda m: ' ' + numero(int(m[0])) + ' ' if len(m[0]) < 7 else m[0], s)
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    for de, a in [(r'\bi erre pe efe\b', 'irpf'), (r'\beme ce pe\b', 'mcp'), (r'\bene ocho ene\b', 'n8n'), (r'\bn ocho n\b', 'n8n'), (r'\bwebjuks?\b', 'webhooks'),
                  (r'\bwebhook\b', 'webhooks'), (r'\biba\b', 'iva'), (r'\b(nokia|noxfi\w*|nofi|nokfy|nocfi|nokfi\w*|noqfi|nokphi|nocfy)\b', 'nokfi'),
                  (r'\bpe de efe\b', 'pdf'), (r'\bveintiun\b', 'veintiuno'), (r'\bun\b', 'uno'), (r'\buna\b', 'uno')]:
        s = re.sub(de, a, s)
    return re.sub(r'[^a-z0-9ñ ]+', ' ', s).split()


def revisar(modelo, vid):
    t = json.load(open(f'{HERE}/voz/{vid}.tiempos.json'))
    pcm = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{HERE}/voz/{vid}.wav', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                                       capture_output=True).stdout, dtype=np.float32)
    # Una sola pasada por todo el audio (cada llamada a Whisper cuesta lo mismo dure lo que dure): las
    # palabras se reparten entre las frases por su marca de tiempo.
    segs, _ = modelo.transcribe(pcm, language='es', beam_size=3, word_timestamps=True, condition_on_previous_text=False)
    PAL = [((w.start + w.end) / 2, w.word.strip()) for sg in segs for w in (sg.words or [])]
    frases = []
    for i, (texto, (a, b)) in enumerate(zip(t['frases'], t['tiempos'])):
        trozo = pcm[int(a * 16000):int(b * 16000)]
        oido = ' '.join(w for (m, w) in PAL if a - 0.12 <= m <= b + 0.12).strip()
        e, o = normal(texto), normal(oido)
        parecido = difflib.SequenceMatcher(None, e, o).ratio()
        letras = sum(len(w) for w in e)
        pausas = texto.count('|') * 0.28 + len(re.findall(r':\s', texto)) * 0.16
        ritmo = letras / max(0.3, (b - a) - pausas)
        # Hueco más largo dentro de la frase (ventanas de 20 ms por debajo de −45 dB).
        v = np.abs(trozo[:len(trozo) // 320 * 320]).reshape(-1, 320).max(axis=1) < 0.0056
        hueco, run = 0, 0
        for x in v:
            run = run + 1 if x else 0
            hueco = max(hueco, run)
        hueco *= 0.02
        ok = parecido >= UMBRAL and RITMO_MIN <= ritmo <= RITMO_MAX and hueco <= HUECO_MAX
        frases.append({'n': i + 1, 'texto': texto, 'oido': oido, 'parecido': round(parecido, 2), 'ritmo': round(ritmo, 1), 'hueco': round(hueco, 2), 'ok': bool(ok)})
    json.dump({'id': vid, 'ok': all(f['ok'] for f in frases), 'frases': frases}, open(f'{HERE}/voz/{vid}.revision.json', 'w'), ensure_ascii=False, indent=1)
    mal = [str(f['n']) for f in frases if not f['ok']]
    print(vid, 'MAL ' + ','.join(mal) if mal else 'OK', flush=True)


if __name__ == '__main__':
    m = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=2)
    for vid in sys.argv[1:]:
        revisar(m, vid)
