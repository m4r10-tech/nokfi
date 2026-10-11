"""marketing/redes/video/voz_supertonic.py — locución con Supertonic 3 (local,
gratis; modelo con licencia OpenRAIL-M: exige avisar de que es voz generada por
IA → etiqueta de IA en TikTok). Lo llama voz.mjs; no se usa a mano.

Entrada (JSON por stdin): { frases: [...], voz, idioma, pasos, velocidad, dir }
Salida: dir/NN.wav (una por frase) y, por stdout, { rate }.
"""
import json
import sys

from supertonic import TTS

p = json.load(sys.stdin)
tts = TTS(auto_download=True)
estilo = tts.get_voice_style(voice_name=p["voz"])
for i, frase in enumerate(p["frases"]):
    wav, _ = tts.synthesize(frase, voice_style=estilo, lang=p.get("idioma", "es"),
                            total_steps=int(p.get("pasos", 16)), speed=float(p.get("velocidad", 1.05)))
    tts.save_audio(wav, f'{p["dir"]}/{i:02d}.wav')
print(json.dumps({"rate": tts.sample_rate}))
