# Redes sociales de Nokfi (sesión 13)

Solo **TikTok** (@nokfi4), con vídeos de la app real. **Nada se publica sin el ok de Mario**,
que es quien programa en Buffer.

| Carpeta | Qué hay |
|---|---|
| `docs/` | [`PRODUCCION.md`](docs/PRODUCCION.md) (norma de trabajo), [`GANCHOS.md`](docs/GANCHOS.md) (métodos y ganchos con fuentes), [`PORTADAS.md`](docs/PORTADAS.md), `ESTADO.md`, `guia-estilo.md`, `musica-licencias.md` |
| `video/guiones/` | un JSON por vídeo |
| `video/herramientas/` | montaje, tarjetas, corte y revisión de la voz, tablero |
| `video/recursos/` | fuentes y música |
| `video/voz/` | audio de cada vídeo (no se versiona) |
| `plantillas/` | tarjeta de cierre |
| `buffer/` | `viaje.mjs` (modo viaje: Buffer automático solo cuando Mario lo pide), claves (`.env`, no se versiona) e historial |
| `salida/` | `PARA-SUBIR/` (vídeos listos para arrastrar a TikTok), `SUBIDOS/`, grabaciones de la app y audios (no se versiona) |

Tablero al día: `python3 marketing/redes/video/herramientas/estado.py`

## Medición

Los enlaces llevan `?utm_source=tiktok`; la web suma `ref_tiktok` por página de llegada (sin
cookies) y sale en el informe diario. Cloudflare Web Analytics da las visitas; TikTok, el
alcance de cada vídeo.
