"""marketing/redes/video/herramientas/lotes_voz.py — sesión 13: textos para locutar FUERA (el usuario genera la voz en ElevenLabs).

Uso (raíz del repo):  python3 marketing/redes/video/herramientas/lotes_voz.py
Escribe marketing/redes/salida/lotes-voz/lote-NN.txt (≤ 2.400 caracteres cada uno: una frase por línea y una línea
en blanco entre vídeos) y lotes.json (qué vídeos y frases lleva cada lote, para partir luego el audio con
partir_audio.py). Orden: primero los vídeos que antes se publican.
"""
import datetime, glob, json, os, re, sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
G = os.path.join(RAIZ, 'marketing/redes/video/guiones')
OUT = os.path.join(RAIZ, 'marketing/redes/salida/lotes-voz')
MAX = 2400


def texto(frase):
    """Texto natural para un locutor: sin marcas de montaje ni los trucos fonéticos de la voz anterior."""
    t = frase.replace('**', '').replace(' | ', ' ').replace('|', ' ')
    for de, a in [(r'\bi erre pe efe\b', 'IRPF'), (r'\biba\b', 'IVA'), (r'\biva\b', 'IVA'), (r'\beme ce pe\b', 'MCP'), (r'\bene ocho ene\b', 'n8n'),
                  (r'\bwebjuks\b', 'webhooks'), (r'\bExcél\b', 'Excel'), (r'\byeison\b', 'JSON'), (r'\bpe de efe\b', 'PDF'), (r'\bNIF iva\b', 'NIF-IVA')]:
        t = re.sub(de, a, t)
    return re.sub(r'\s+', ' ', t).strip()


def main():
    # Los lotes ya repartidos no se tocan: el usuario locuta a partir de esos textos. Rehacerlos descuadraría sus audios.
    if os.path.exists(os.path.join(OUT, 'lotes.json')) and '--rehacer' not in sys.argv:
        return print('Ya hay lotes en salida/lotes-voz/. Para repartirlos de nuevo: --rehacer [--fecha AAAA-MM-DDTHH:MM]')
    ahora = sys.argv[sys.argv.index('--fecha') + 1] if '--fecha' in sys.argv else datetime.datetime.now().strftime('%Y-%m-%dT%H:%M')
    orden, vistos = [], set()
    pubs = [x for f in glob.glob(os.path.join(RAIZ, 'marketing/redes/buffer/publicaciones/*.json')) for x in json.load(open(f))]
    publicados = {x['pieza'] for x in pubs if x.get('aprobado') and x['cuando'] < ahora}
    for x in sorted([x for x in pubs if x.get('aprobado') and x['cuando'] >= ahora], key=lambda x: x['cuando']):
        if x['pieza'] not in vistos: orden.append(x['pieza']); vistos.add(x['pieza'])
    for f in sorted(glob.glob(os.path.join(G, 'v*.json'))):
        vid = os.path.basename(f)[:-5]
        if vid not in vistos and vid not in publicados: orden.append(vid); vistos.add(vid)
    videos = []
    for vid in orden:
        gp = os.path.join(G, vid + '.json')
        if not os.path.exists(gp): continue
        g = json.load(open(gp))
        frases = [texto(e.get('locucion') or e['voz']) for e in g['escenas']] + ([texto(g['cierre'].get('locucion') or g['cierre']['voz'])] if g.get('cierre', {}).get('voz') else [])
        videos.append({'id': vid, 'frases': frases})
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, 'lote-*.txt')): os.remove(f)
    lotes, actual, largo = [], [], 0
    for v in videos:
        n = sum(len(f) + 1 for f in v['frases']) + 1
        if actual and largo + n > MAX: lotes.append(actual); actual, largo = [], 0
        actual.append(v); largo += n
    if actual: lotes.append(actual)
    for i, l in enumerate(lotes, 1):
        open(os.path.join(OUT, f'lote-{i:02d}.txt'), 'w').write('\n\n'.join('\n'.join(v['frases']) for v in l) + '\n')
    json.dump({f'lote-{i:02d}': l for i, l in enumerate(lotes, 1)}, open(os.path.join(OUT, 'lotes.json'), 'w'), ensure_ascii=False, indent=1)
    total = sum(len(open(os.path.join(OUT, f'lote-{i:02d}.txt')).read()) for i in range(1, len(lotes) + 1))
    print(f'{len(videos)} vídeos · {len(lotes)} lotes · {total} caracteres en total')


if __name__ == '__main__':
    main()
