# Nokfi · cómo aplicamos el método

> El método general está en [`../metodo/`](../metodo/00-INDICE.md). Aquí solo va lo propio de
> Nokfi: decisiones de Mario, herramientas, carpetas, voz y estado. Última revisión: 2026-10-12.
>
> **Vídeo de referencia**: `x001` («Todo lo que ofrece Nokfi en 60 segundos»), aprobado por
> Mario el 2026-10-12. A partir de él se varían ganchos, movimientos y velocidad
> ([`REGISTRO-VARIANTES.md`](REGISTRO-VARIANTES.md)).

## 1. Decisiones fijas de Mario

1. **Solo TikTok** (@nokfi4). Sin publicidad de pago.
2. **Se enseña la app real** con la cuenta de ejemplo («Taller García», datos ficticios). Sin
   caras ni imágenes generadas. Solo lo que Nokfi ya hace.
3. **Todo vídeo lleva voz.**
4. **Voz**: ElevenLabs, voz «Martin Osborne – Deep and Passionate», con el plan de Mario para
   uso publicitario. La genera él. Publicaciones marcadas como contenido con IA.
5. **Gratis por defecto**: la voz es la única herramienta de pago.
6. **Imagen**: aire a los lados, letra contenida, edición realista y muy animada.
7. **Mario sube a mano** desde `salida/PARA-SUBIR/`. Buffer automático solo como «modo viaje».
8. **Nunca en ráfaga**: TikTok penalizó la cuenta el 11-12 de octubre por publicar muchos
   vídeos seguidos (los siguientes se quedaron en 0-10 visualizaciones). Mínimo 4-5 horas
   entre vídeos.
9. **Lotes con visto bueno**: nada se fabrica en masa sin que Mario apruebe el lote anterior.

## 2. Quién hace qué

| Tarea | Quién |
|---|---|
| Guiones, grabaciones, montaje, control de calidad | Claude |
| Leer y aprobar los textos de voz; locutarlos en ElevenLabs | Mario |
| Visto bueno de cada vídeo (puerta 3 del control de calidad) | Mario |
| Subir a TikTok y apuntar las cifras | Mario |
| Modo viaje, solo cuando Mario lo pide | Claude |

## 3. Carpetas

Ningún archivo suelto: solo `README.md` vive en la raíz de `marketing/redes/`.

```
marketing/redes/
├── README.md
├── docs/
│   ├── metodo/        el método general (00-10)
│   └── nokfi/         esta aplicación, banco de ganchos, registro de variantes, estilo, música, estado
├── video/
│   ├── guiones/       un JSON por vídeo (x001…) + _biblio.json (índice de grabaciones)
│   ├── herramientas/  editor.mjs, editor-pagina.html, partir_audio.py, revisa_audio.py, estado.py
│   │                  y, de la etapa 1, montar.mjs, tarjetas.mjs y serie.py
│   ├── recursos/      fuentes/ y musica/
│   └── voz/           audio cortado por vídeo (no versionado)
├── plantillas/        tarjetas de imagen de la etapa 1
├── buffer/            viaje.mjs, .env (claves) y publicaciones/ (historial de la etapa 1)
└── salida/            no versionado
    ├── PARA-SUBIR/    un vídeo aprobado por carpeta, en orden
    ├── SUBIDOS/       lo ya publicado
    ├── lotes-voz/     una carpeta por lote (texto.txt + el audio) y _indice/ (lotes.json, VOZ.txt)
    ├── video/_biblio/ grabaciones de la app
    ├── _control/      estado del modo viaje
    ├── _registro/     versiones anteriores y hojas de revisión
    └── _PAPELERA/     etapa 1 y motores de voz retirados; se puede borrar entera
```

Carpeta de entrega: `PARA-SUBIR/NNN-tema/` con `video.mp4`, `portada.png`, `texto.txt`,
`titulo.txt` y `portada-ms.txt`.

## 4. Existencias

**Grabaciones** (`salida/video/_biblio/clips/`, índice en `video/guiones/_biblio.json`): 66
planos a 1080×2340 y 30 fps, unos 28 minutos.

| Zona | Grabado | Falta o flojo |
|---|---|---|
| Negocio | Inicio · Finanzas · impuestos · cobros · previsión de caja · gastos fijos · libro · factura nueva (vacía y rellenándose) · calendario · diagnóstico e informe · cuestionario · calculadoras · Excel (4 pantallas) · sector · historial · configuración · ayuda | **Lectura de una factura por foto** (el entorno local no tiene IA) · facturas emitidas (sale vacía) · escenarios de caja en detalle |
| Web pública | portada · precios · documentación de la API · guías · entrada · calculadoras (IVA, retención, cuota, coste de empleado, precio por hora) · validador de NIF · calendario | — |
| Desarrolladores | portada · claves · Playground (NIF, IVA, retención, 130, trimestre, calendario, uso) · webhooks · plantillas de n8n | registro de llamadas y clientes (salen vacíos) · servidor MCP (no hay pantalla: va en tarjeta) |

Avisos sobre planos concretos: `facturanueva` enseña un aviso amarillo de datos pendientes
(usar `factura` o `facturarellena`); el texto del `informe` dice «0 €» (usar solo la nota);
en `ayuda` sale el nombre de Mario.

**Voz** (`salida/lotes-voz/`, una carpeta por lote con `texto.txt` y el audio dentro): locutado
y montado, `explicativo-60s/`. Escritos y pendientes de leer y locutar: `lote-01/` (x002-x006)
y `lote-02/` (x007-x009). El audio se guarda **dentro de la carpeta de su lote**, con
cualquier nombre. `_indice/lotes.json` dice qué vídeos y frases lleva cada lote.

## 5. Órdenes

Desde la raíz del repositorio. **Un solo proceso pesado a la vez.**

```bash
# Grabar planos (añadirlos después a video/guiones/_biblio.json)
cd backend && PLAYWRIGHT_CORE=$(realpath ../../n8n-nodes-nokfi/node_modules/playwright-core) \
  taskset -c 0,1 nice -n 19 node scripts/redes-clips.js <archivo-de-clips.json>

# Cortar la voz de un lote (primero en prueba)
marketing/redes/video/.asr/bin/python marketing/redes/video/herramientas/partir_audio.py lote-01 --tempo 1 --prueba

# Fotogramas de prueba y montaje completo
PLAYWRIGHT_CORE=$(realpath ../n8n-nodes-nokfi/node_modules/playwright-core) nice -n 19 \
  node marketing/redes/video/herramientas/editor.mjs marketing/redes/video/guiones/<id>.json --foto 0.5 8 20
PLAYWRIGHT_CORE=… taskset -c 0,1 nice -n 19 ionice -c 3 \
  node marketing/redes/video/herramientas/editor.mjs marketing/redes/video/guiones/<id>.json

# Ver los vídeos en el navegador
cd marketing/redes/salida && python3 -m http.server 8765 --bind 127.0.0.1

# Modo viaje (solo si Mario lo pide)
node marketing/redes/buffer/viaje.mjs estado | lanzar --simular | lanzar [--al-dia N] | parar
```

## 6. El montador (`editor.mjs`)

Dibuja cada fotograma en `editor-pagina.html` según el tiempo y lo une con ffmpeg. El guion
(`video/guiones/<id>.json`) dice, por escena: tipo (`titulo`, `seccion`, `app`, `cierre`),
frases que cubre, etiqueta de serie, título, planos (`clip`, `desde`, `foco`, `zoom`, `peso`)
y rótulos (`texto`, `en`, `y`, `lado`, `plano`). `subtitulos` permite que se lea algo distinto
de lo que se dice («nokfi punto app» → «nokfi.app»).

- Una pasada completa de 56 s tarda **unos 30 minutos** en este portátil: primero `--foto`,
  y los cambios, todos juntos.
- Qué opciones de variación están construidas: tabla al final de `REGISTRO-VARIANTES.md`.
- `montar.mjs`, `tarjetas.mjs` y `serie.py` son de la etapa 1 (pantalla completa, letra
  grande). Se conservan porque `tarjetas.mjs` tiene recursos aprovechables (terminal, chat,
  gráfico, calendario) que hay que pasar al montador nuevo.

## 7. Series

| Serie | Etiqueta | Color |
|---|---|---|
| Autónomos y negocios | `AUTÓNOMOS` | azul `#2F7FE0` |
| Calculadoras gratis | `CALCULADORA` | verde `#22B07D` |
| Desarrolladores (API, MCP, n8n) | `API` | violeta `#8B5CF6` |
| Qué es Nokfi / recorridos | `NOKFI` | azul claro `#38BDF8` |

Marca: azul Nokfi `#1456A2`, Plus Jakarta Sans (ExtraBold y SemiBold), fondo `#070D18`.
Música: las tres pistas de [`musica-licencias.md`](musica-licencias.md).

## 8. Publicación

- **A mano**, desde `PARA-SUBIR/`; lo subido pasa a `SUBIDOS/`.
- Huecos: **13:30 y 22:30** (dos al día como mucho); si se quiere más, 09:00 y 18:00.
- La cuenta viene de una penalización: empezar con **uno al día**.
- **Modo viaje** (`buffer/viaje.mjs`): toma `PARA-SUBIR` en orden desde el último publicado,
  llena Buffer hasta 10 (tope del plan gratuito), respeta 4 horas mínimas y se frena a las 200
  peticiones al día (la API admite 250). Probado solo en simulación: **la primera vez de
  verdad, con Mario delante**. Buffer está a cero desde el 2026-10-12.

## 9. El portátil

4 núcleos, 8 GB, sin gráfica; se apaga por calor.

- Siempre `taskset -c 0,1 nice -n 19 ionice -c 3`. Un proceso pesado cada vez.
- `editor.mjs` se detiene a 72 °C y sigue a 62 °C. La grabación no se frena sola: vigilarla.
- No grabar y montar a la vez (la grabación da tiempos de espera).
- Whisper a 2 hilos. Nada de modelos de voz en local.

## 10. Historia y lecciones

- **Etapa 1 (10-12 oct.)**: 15 vídeos publicados y 49 montados con voz sintética local, a
  pantalla completa. Se paró: la voz seseaba, los vídeos eran de molde, y publicar en ráfaga
  hundió el alcance. Está en `salida/_PAPELERA/etapa-1/`.
- Automatizar la cola contra Buffer cada 10 minutos agotó el cupo diario de su API.
- TikTok sirve los vídeos a 576×1024 aunque se suba más calidad.
- **Etapa 2 (desde el 12 oct.)**: voz de ElevenLabs por lotes, montador nuevo, entrega manual.
  `x001` es la base aprobada.

## 11. Dónde estamos

- **x001** aprobado (F1 Recorrido). Tiene dos mejoras preparadas sin remontar.
- **x002** montado como F1 y visto por Mario: correcciones de voz hechas (lecciones V1-V5) y
  pendiente de rehacer en **F2 La cifra**. Falta que Mario locute la frase nueva
  (`salida/lotes-voz/retoque-x002-frase-3/`).
- **Lotes 1 y 2** (x002-x009): voz cortada con el cortador nuevo y revisada. Cada vídeo tiene
  formato asignado en `REGISTRO-VARIANTES.md`.
- **Siguiente**: construir los formatos en el orden del registro, enseñando cada uno en
  fotogramas fijos, y montar cada vídeo en el suyo.

Sustituir una frase: `…/partir_audio.py --retoque <id> <nº de frase> <audio> ["texto nuevo"]`.
