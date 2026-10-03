# Redes sociales de Nokfi (sesión 13)

X, Instagram y TikTok, programadas con **Buffer**. **Nada se publica sin el ok
del usuario.**

| Archivo | Qué es |
|---|---|
| `guia-estilo.md` | bios, enlaces con UTM, tono, lo que nunca decimos |
| `calendario-AAAA-MM-MM.md` | calendario para aprobar (textos + guiones de vídeo) |
| `piezas/<semana>.json` | láminas de cada imagen → `plantillas/render.mjs` |
| `publicaciones/<semana>.json` | qué se publica, dónde y cuándo (hora de Madrid), con `aprobado` |
| `salida/` | PNG generados y vídeos grabados (`salida/<pieza>/video.mp4`); no se versiona |
| `agente-semanal.md` | instrucciones del agente que prepara la semana siguiente |

## Flujo de cada semana

1. **Borrador**: el agente semanal (o Claude en una sesión) escribe
   `piezas/<semana>.json` y `publicaciones/<semana>.json` con `"aprobado": false`.
2. **Imágenes**: `PLAYWRIGHT_CORE=../n8n-nodes-nokfi/node_modules/playwright-core node marketing/redes/plantillas/render.mjs marketing/redes/piezas/<semana>.json`
3. **Revisión del usuario**: textos e imágenes; lo que vale pasa a `"aprobado": true`.
   Los vídeos los graba el usuario y van en `salida/<pieza>/video.mp4`.
4. `node marketing/redes/buffer.mjs revisar marketing/redes/publicaciones/<semana>.json`
5. `node marketing/redes/buffer.mjs subir …` → imágenes al VPS (`https://nokfi.app/api/redes-media/<pieza>/<archivo>`)
6. `node marketing/redes/buffer.mjs programar …` → Buffer (guarda `buffer_id`; nunca se envía dos veces).
   Con `--borrador` quedan como borrador en Buffer para un último vistazo.

Primera vez: `cp marketing/redes/.env.example marketing/redes/.env`, el usuario
escribe su clave de Buffer, y `node marketing/redes/buffer.mjs canales` y
`esquema` para comprobar la conexión y los campos de la API (beta pública).

## Medición

Los enlaces llevan `?utm_source=<red>`; la web suma `ref_x`, `ref_instagram` y
`ref_tiktok` por página de llegada (sin cookies) y salen en el informe diario.
Cloudflare Web Analytics da las visitas; Buffer, el alcance de cada publicación.
