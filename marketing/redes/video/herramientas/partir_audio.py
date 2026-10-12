"""marketing/redes/video/herramientas/partir_audio.py — sesión 13: parte un audio largo locutado FUERA (ElevenLabs) en la voz de cada vídeo.

El usuario pega marketing/redes/salida/lotes-voz/lote-NN.txt en ElevenLabs y guarda el audio. Este guion lo
transcribe con Whisper (marcas de tiempo por palabra), lo alinea con el texto del lote y corta cada frase.

Uso (venv .asr, desde la raíz del repo):
  marketing/redes/video/.asr/bin/python marketing/redes/video/herramientas/partir_audio.py lote-01 /ruta/al/audio.mp3 [--prueba]
Salida por vídeo: voz/<id>.wav + voz/<id>.tiempos.json + voz/<id>.externa.json (calidad de la
alineación). Una frase con menos del 80 % de palabras reconocidas deja el vídeo marcado como DUDOSO.
--prueba no escribe en voz/: solo informa.
"""
import difflib
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from revisa_audio import normal  # misma normalización que la revisión de audio

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # marketing/redes/video
LOTES = os.path.join(HERE, '../salida/lotes-voz/lotes.json')
SR, PAUSA = 44100, 0.30
TEMPO = 1.06  # un punto más ágil que el original, sin cambiar el tono


def silencio_central(pcm, a, b):
    """Punto (s) más silencioso entre a y b (ventanas de 20 ms a 16 kHz); si no hay hueco, el punto medio."""
    if b - a < 0.06: return (a + b) / 2
    x = np.abs(pcm[int(a * 16000):int(b * 16000)])
    n = len(x) // 320
    if n < 2: return (a + b) / 2
    e = x[:n * 320].reshape(n, 320).mean(axis=1)
    k = int(np.argmin(np.convolve(e, np.ones(3) / 3, mode='same')))
    return a + (k + 0.5) * 0.02


def main():
    lote, audio = sys.argv[1], sys.argv[2]
    prueba = '--prueba' in sys.argv
    videos = json.load(open(LOTES))[lote]
    pcm = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout, dtype=np.float32)
    total = len(pcm) / 16000
    modelo = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=2)
    segs, _ = modelo.transcribe(pcm, language='es', beam_size=3, word_timestamps=True, condition_on_previous_text=False)
    oido = []   # (token, inicio, fin)
    for sg in segs:
        for w in (sg.words or []):
            for tok in normal(w.word): oido.append((tok, w.start, w.end))
    esperado = []  # (token, vídeo, frase)
    for vi, v in enumerate(videos):
        for fi, f in enumerate(v['frases']):
            for tok in normal(f): esperado.append((tok, vi, fi))
    sm = difflib.SequenceMatcher(None, [e[0] for e in esperado], [o[0] for o in oido], autojunk=False)
    tiempo = [None] * len(esperado)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): tiempo[blk.a + k] = (oido[blk.b + k][1], oido[blk.b + k][2])
    # Límites aproximados de cada frase por sus palabras reconocidas.
    frases = []
    i = 0
    for vi, v in enumerate(videos):
        for fi, f in enumerate(v['frases']):
            n = len(normal(f)); ts = [t for t in tiempo[i:i + n] if t]
            frases.append({'v': vi, 'f': fi, 'ini': ts[0][0] if ts else None, 'fin': ts[-1][1] if ts else None, 'ok': len(ts) / max(1, n)})
            i += n
    # Frases sin ninguna palabra reconocida: se reparten el hueco entre sus vecinas.
    for k, fr in enumerate(frases):
        if fr['ini'] is None:
            ant = next((frases[j]['fin'] for j in range(k - 1, -1, -1) if frases[j]['fin'] is not None), 0)
            sig = next((frases[j]['ini'] for j in range(k + 1, len(frases)) if frases[j]['ini'] is not None), total)
            fr['ini'], fr['fin'] = ant, sig
    # Corte entre frases: el punto más silencioso entre el final de una y el principio de la siguiente.
    cortes = [0.0] + [silencio_central(pcm, min(frases[k]['fin'], frases[k + 1]['ini']), max(frases[k]['fin'], frases[k + 1]['ini'])) for k in range(len(frases) - 1)] + [total]
    for k, fr in enumerate(frases): fr['a'], fr['b'] = cortes[k], cortes[k + 1]
    tmp = os.path.join(HERE, 'voz', '.tmp-partir')
    os.makedirs(tmp, exist_ok=True)
    recorte = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03'
    for vi, v in enumerate(videos):
        fs = [fr for fr in frases if fr['v'] == vi]
        peor = min(fr['ok'] for fr in fs)
        estado = 'OK' if peor >= 0.8 else 'DUDOSO'
        print(f"{v['id']} {estado} · peor frase {peor:.2f} · {fs[0]['a']:.1f}-{fs[-1]['b']:.1f} s", flush=True)
        if prueba: continue
        partes, tiempos, t = [], [], 0.0
        for fr in fs:
            p = os.path.join(tmp, f"{vi}-{fr['f']}.wav")
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f"{fr['a']:.3f}", '-to', f"{fr['b']:.3f}", '-i', audio, '-af', f'{recorte},areverse,{recorte},areverse,atempo={TEMPO}', '-ar', str(SR), '-ac', '1', p], check=True)
            d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout or 0)
            tiempos.append([round(t, 3), round(t + d, 3)]); t += d + PAUSA
            partes.append(p)
        sil = os.path.join(tmp, 'sil.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=mono', '-t', str(PAUSA), sil], check=True)
        lista = os.path.join(tmp, 'lista.txt')
        open(lista, 'w').write('\n'.join(f"file '{x}'" for k, p in enumerate(partes) for x in ([sil, p] if k else [p])) + '\n')
        destino = os.path.join(HERE, 'voz', v['id'] + '.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c:a', 'pcm_s16le', destino], check=True)
        json.dump({'frases': v['frases'], 'tiempos': tiempos}, open(destino.replace('.wav', '.tiempos.json'), 'w'), ensure_ascii=False, indent=1)
        json.dump({'lote': lote, 'estado': estado, 'frases': [{'n': fr['f'] + 1, 'reconocido': round(fr['ok'], 2)} for fr in fs]}, open(destino.replace('.wav', '.externa.json'), 'w'), ensure_ascii=False, indent=1)
    subprocess.run(['rm', '-rf', tmp])


if __name__ == '__main__':
    main()
