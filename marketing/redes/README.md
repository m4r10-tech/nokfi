# Redes sociales de Nokfi (sesión 13)

Solo **TikTok** (@nokfi4), con vídeos de la app real. **Nada se publica sin el ok de Mario**,
que es quien sube los vídeos.

| Carpeta | Qué hay |
|---|---|
| `docs/metodo/` | **El método**, válido para cualquier producto: [índice](docs/metodo/00-INDICE.md) · flujo · ganchos · guion · edición · variación · voz y sonido · portadas · publicación · control de calidad · aprendizaje |
| `docs/nokfi/` | **Cómo lo aplicamos a Nokfi**: [`APLICACION.md`](docs/nokfi/APLICACION.md), banco de ganchos, registro de variantes, guía de estilo, música |
| `video/guiones/` | un JSON por vídeo y el índice de grabaciones |
| `video/herramientas/` | montador, corte y revisión de la voz |
| `video/recursos/` | fuentes y música |
| `video/voz/` | audio de cada vídeo (no se versiona) |
| `plantillas/` | tarjetas de imagen de la etapa 1 |
| `buffer/` | `viaje.mjs` (modo viaje: Buffer automático solo cuando Mario lo pide), claves (`.env`, no se versiona) e historial |
| `salida/` | `PARA-SUBIR/` (vídeos listos para arrastrar a TikTok), `SUBIDOS/`, grabaciones de la app y audios (no se versiona) |

## Medición

Los enlaces llevan `?utm_source=tiktok`; la web suma `ref_tiktok` por página de llegada (sin
cookies) y sale en el informe diario. Cloudflare Web Analytics da las visitas; TikTok, el
alcance de cada vídeo.
