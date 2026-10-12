# Redes sociales de Nokfi (sesión 13)

Solo **TikTok** (@nokfi4), con vídeos de la app real. **Nada se publica sin el ok de Mario**,
que es quien programa en Buffer.

| Qué | Dónde |
|---|---|
| **Cómo se produce un vídeo** (norma de trabajo) | [`video/PRODUCCION.md`](video/PRODUCCION.md) |
| **En qué paso está cada vídeo** | [`video/ESTADO.md`](video/ESTADO.md) (`python3 marketing/redes/video/estado.py`) |
| Tono, bios, enlaces con UTM, lo que nunca decimos | `guia-estilo.md` |
| Guiones y herramientas de vídeo | `video/` |
| Vídeos terminados, audios de los lotes, hojas de contactos | `salida/` (no se versiona) |
| Herramienta de Buffer (uso manual) | `buffer.mjs`, `rellenar-cola.sh` (sin cron) |
| Registro de lo enviado a Buffer | `publicaciones/` |
| Portadas | `plantillas/render.mjs` |
| Página local para repasar publicaciones | `revision.py` |
| Etapa de imágenes para X/Instagram (abandonada) | `archivo/imagenes-x-instagram/` |

Claves: `cp .env.example .env` y Mario escribe ahí la de Buffer. El `.env` no se versiona
ni se pega en ningún chat.

## Medición

Los enlaces llevan `?utm_source=tiktok`; la web suma `ref_tiktok` por página de llegada (sin
cookies) y sale en el informe diario. Cloudflare Web Analytics da las visitas; TikTok, el
alcance de cada vídeo.
