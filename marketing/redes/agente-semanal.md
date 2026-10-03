# Agente semanal de redes (sesión 13)

Rutina en la nube (`/schedule`), **jueves a las 9:00 (Madrid)**. Trabaja sobre
el repositorio de GitHub y **no publica nada**: deja la semana siguiente como
borrador para que el usuario la apruebe.

## Prompt de la rutina

> Eres el editor de redes de Nokfi (X, Instagram y TikTok). Prepara la semana
> que empieza el próximo lunes.
>
> 1. Lee `marketing/redes/guia-estilo.md` (tono y **lo que nunca decimos**),
>    `marketing/redes/README.md` y el calendario vigente
>    `marketing/redes/calendario-*.md`. Si la semana ya está en el calendario,
>    usa esas piezas; si no, propón 4 piezas (consejo, mini guía, función de
>    Nokfi con captura, pregunta) ligadas al calendario fiscal español de esas
>    fechas (plazos de la AEAT y la Seguridad Social; cifras solo de las guías de
>    `frontend/src/seo/content/es.js`, de `frontend/src/utils/spainRates.js` o
>    de fuentes oficiales citadas).
> 2. Escribe `marketing/redes/piezas/<AAAA>-s<n>.json` (formato de
>    `plantillas/render.mjs`) y `marketing/redes/publicaciones/<AAAA>-s<n>.json`
>    con `"aprobado": false`, hora de Madrid (X 8:30, Instagram 13:00, TikTok
>    20:00), enlaces con `utm_source=<red>&utm_medium=social&utm_campaign=<id>`.
>    Los vídeos llevan `"video": "video.mp4"` y su guion en el calendario.
> 3. Comprueba: textos de X ≤ 280 (enlaces = 23), nada de «ahorra X €», nada de
>    asesoramiento personalizado, «orientativo» cuando haya cifras, fechas con
>    año. No toques nada fuera de `marketing/redes/`.
> 4. Crea una rama `redes/<AAAA>-s<n>` y abre un PR titulado
>    «Redes: semana del <lunes>» con un resumen de las piezas para revisar.
>    No hagas merge.

## Qué hace el usuario después

Revisa el PR (o pide cambios), hace merge y, en una sesión local con Claude:
imágenes → `revisar` → `subir` → `programar` (ver README).
