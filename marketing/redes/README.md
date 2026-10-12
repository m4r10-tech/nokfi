# Redes sociales de Nokfi (sesión 13)

Solo **TikTok** (@nokfi4), con vídeos de la app real. **Nada se publica sin el ok de Mario**,
que es quien programa en Buffer.

| Carpeta | Qué hay |
|---|---|
| `docs/` | [`PRODUCCION.md`](docs/PRODUCCION.md) (norma de trabajo), [`ESTADO.md`](docs/ESTADO.md) (en qué paso está cada vídeo), `guia-estilo.md`, `musica-licencias.md` |
| `video/guiones/` | un JSON por vídeo |
| `video/herramientas/` | montaje, tarjetas, corte y revisión de la voz, tablero |
| `video/recursos/` | fuentes y música |
| `video/voz/` | audio de cada vídeo (no se versiona) |
| `plantillas/` | portadas |
| `buffer/` | herramienta de Buffer (uso manual), claves (`.env`, no se versiona) y registro de lo enviado |
| `salida/` | vídeos terminados, audios de los lotes y hojas de contactos (no se versiona) |

Tablero al día: `python3 marketing/redes/video/herramientas/estado.py`

## Medición

Los enlaces llevan `?utm_source=tiktok`; la web suma `ref_tiktok` por página de llegada (sin
cookies) y sale en el informe diario. Cloudflare Web Analytics da las visitas; TikTok, el
alcance de cada vídeo.
