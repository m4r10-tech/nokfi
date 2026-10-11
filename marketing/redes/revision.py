"""Página local para revisar publicaciones antes de aprobarlas (sesión 13).

Uso (desde marketing/redes/):  python3 revision.py publicaciones/2026-s1.json [más.json]
Genera salida/revision.html; se ve con:  cd salida && python3 -m http.server 8765 --bind 127.0.0.1
"""
import datetime, html, json, os, sys

RED = {'x': 'X', 'instagram': 'Instagram', 'tiktok': 'TikTok'}
DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

out, n = [], 0
for f in sys.argv[1:]:
    out.append(f'<h2>{html.escape(os.path.basename(f))}</h2>')
    for p in sorted(json.load(open(f)), key=lambda p: p['cuando']):
        n += 1
        d = datetime.datetime.fromisoformat(p['cuando'])
        imgs = ''
        if p.get('pieza') and os.path.isdir(os.path.join('salida', p['pieza'])):
            files = sorted(x for x in os.listdir(os.path.join('salida', p['pieza'])) if x.endswith('.png'))
            imgs = ''.join(f'<a href="{p["pieza"]}/{x}" target="_blank"><img src="{p["pieza"]}/{x}"></a>' for x in files)
            if p.get('video') and os.path.isfile(os.path.join('salida', p['pieza'], p['video'])):
                imgs = f'<video src="{p["pieza"]}/{p["video"]}" controls preload="metadata" poster="{p["pieza"]}/01-portada.png"></video>'
            elif p.get('video'):
                imgs = '<div class="vid">🎬 Vídeo por grabar (guion en el calendario). Portada:</div>' + imgs
        estado = '✅ aprobado' if p.get('aprobado') else 'pendiente'
        out.append(f'''<section><header><span class="n">{n}</span><b class="red {p["red"]}">{RED[p["red"]]}</b> {p.get("tipo", "")}
 · {DIAS[d.weekday()]} {d.day} {MESES[d.month]} · {d.strftime("%H:%M")} · {estado} <code>{p["id"]}</code></header>
<div class="cols"><pre>{html.escape(p["texto"])}</pre><div class="imgs">{imgs or "<i>Solo texto</i>"}</div></div></section>''')

css = '''body{font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:24px;max-width:1300px}
h1{margin:0 0 4px} h2{margin:32px 0 8px;color:#1456A2}
section{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 3px #0001}
header{font-size:15px;margin-bottom:10px} code{color:#64748b;font-size:12px;margin-left:8px}
.n{display:inline-block;background:#1456A2;color:#fff;border-radius:6px;padding:1px 8px;margin-right:6px;font-weight:700}
.red{padding:2px 8px;border-radius:6px;color:#fff} .x{background:#000} .instagram{background:#c13584} .tiktok{background:#25262b}
.cols{display:flex;gap:16px} pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.45;flex:0 0 380px;margin:0;background:#f8fafc;padding:12px;border-radius:8px}
.imgs{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start} .imgs a{flex:none} .imgs img{height:260px;border-radius:6px;border:1px solid #e2e8f0}
.vid{width:100%;font-size:13px;color:#b45309} video{height:560px;border-radius:10px;background:#000}'''
page = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Revisión de redes</title><style>{css}</style></head><body>
<h1>Revisión de redes</h1><p>{n} publicaciones. Dime por número: ✅ vale · ✏️ cambiar (qué) · ❌ quitar. Clic en una imagen para verla a tamaño real.</p>
{"".join(out)}</body></html>'''
open('salida/revision.html', 'w').write(page)
print(f'{n} publicaciones → salida/revision.html')
