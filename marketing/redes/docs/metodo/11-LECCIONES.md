# 11 · Lecciones: cada corrección se convierte en norma

> Aquí se apunta **todo lo que alguien ha tenido que corregir a mano**, con su causa y con la
> regla que evita que se repita. El objetivo es que cada lote necesite menos revisión que el
> anterior. Una lección no está cerrada hasta que tiene **comprobación automática** o un
> punto en la lista de control de calidad (documento 09).

## Cómo se apunta

| Campo | Qué se escribe |
|---|---|
| Qué se notó | con las palabras de quien lo vio, y el segundo del vídeo |
| Causa | la real, comprobada; si no se pudo comprobar, se dice |
| Regla | qué se hace a partir de ahora |
| Dónde vive | el documento o la herramienta que la aplica |

## Voz y sonido

| # | Qué se notó | Causa | Regla | Dónde vive |
|---|---|---|---|---|
| V1 | «Un corte raro o pausa» al final de una frase (x002, 00:03 y 00:16) | El cortador se fiaba de la marca de tiempo del reconocedor, que acaba la palabra antes de tiempo: cortaba la última sílaba («vein-») y metía un silencio de 0,3 s. Pasa sobre todo cuando el locutor enlaza dos líneas | Donde no hay silencio real entre dos líneas (menos de 0,10 s), **no se corta ni se añade pausa**: se dejan pegadas, como sonaron | `partir_audio.py` (avisa: «sin pausa antes de la frase N») |
| V2 | Finales de palabra comidos («veinte», «tres») | El recorte a −45 dB quitaba las sílabas finales suaves | El final de frase se busca por energía a −52 dB y se dejan 90 ms de cola; cada trozo entra y sale con fundido | `partir_audio.py` |
| V3 | El volumen sube y baja a mitad de frase | El normalizador automático de ffmpeg cambia la ganancia sobre la marcha (hasta 6 dB medidos) | **Una sola ganancia fija** por vídeo, medida antes; nunca normalización dinámica | `editor.mjs` |
| V4 | Faltan pausas después de los dos puntos | El locutor no siempre para tras «:» | Tras «:» tiene que haber al menos 0,15 s; si no, se abre una pausa de 0,24 s en el punto más silencioso | `partir_audio.py` (avisa: «pausa abierta tras :») |
| V5 | «Finanzas, Impuestos» debía ser «Finanzas e Impuestos» | El texto imitaba la ruta del menú en vez de decirlo como se habla | **Se escribe como se dice**: las rutas de menú se leen con «e», «y» o «de» («Finanzas e Impuestos», «el Playground de la API»). Nunca una enumeración con comas que no sea una lista | documento 03 |
| V6 | Una frase mal hay que repetirla sin rehacer todo | — | Cada frase se guarda suelta; una frase nueva se sustituye con `partir_audio.py --retoque` | `partir_audio.py` |
| V7 | El reconocedor confunde «sin cuenta» con «cincuenta» | Suenan igual | Evitar en el texto expresiones que suenen como una cifra si hay cifras cerca («sin registrarte» en vez de «sin cuenta») | documento 03 |

## Imagen y montaje

| # | Qué se notó | Causa | Regla | Dónde vive |
|---|---|---|---|---|
| I1 | «La estructura, la edición y el desarrollo son iguales que en el primero» (x002) | Cambiar apertura y transición no cambia la **composición**: el teléfono centrado con cabecera y rótulos se ve igual | La variedad se hace con **formatos completos** (documento 12), que cambian composición, desarrollo y ritmo; no con retoques sobre el mismo molde | documento 12 |
| I2 | El teléfono tapaba el contador de la portada | La cámara se movía aunque el zoom fuera 1 | Con zoom 1 no hay movimiento | `editor.mjs` |
| I3 | Parpadeo del fondo del título entre escenas | El velo se fundía en cada cambio de escena | El velo solo entra y sale en los extremos de un bloque de producto | `editor.mjs` |
| I4 | Rótulo de una pantalla que sigue en la siguiente | Los rótulos duraban toda la escena | Un rótulo puede ir atado a su plano (`plano`) | `editor.mjs` |
| I5 | Pantallas con avisos, vacías o a medio cargar | Se usó el plano sin mirarlo | Todo plano se mira en fotograma fijo antes de montar; los planos flojos se anotan en el inventario | documento 09, puerta 2 |
| I6 | Cifras a medio teclear en pantalla (12,10 € en vez de 1.210 €) | El plano empezaba durante la escritura | Un plano de «resultado» empieza cuando la cifra ya está completa | guion visual |
| I7 | El reloj de «60 s» salía en una portada que no iba de tiempo | Estaba fijo en la plantilla de título | Los adornos de portada son opcionales y los pide el guion | `editor.mjs` |

## Publicación

| # | Qué se notó | Causa | Regla | Dónde vive |
|---|---|---|---|---|
| P1 | Vídeos con 0-10 visualizaciones | Se publicaron muchos seguidos | Nunca en ráfaga; mínimo 4-5 horas entre vídeos | documento 08 |
| P2 | No se podía corregir la cola | Un proceso consultaba al programador cada 10 minutos y agotó su cupo | Nada de bucles contra servicios externos; una pasada y fuera | documento 08 |

## Proceso

| # | Qué se notó | Causa | Regla | Dónde vive |
|---|---|---|---|---|
| R1 | Decenas de vídeos que hubo que tirar | Se fabricó en masa antes de aprobar la voz y el estilo | Lotes pequeños con visto bueno | documento 01 |
| R2 | Media hora perdida por cada cambio pequeño | Se montaba entero para ver un detalle | Fotogramas fijos primero; cambios agrupados | documentos 01 y 09 |

## Antes de cada lote

Se relee esta página entera. Si una regla de aquí no está todavía en una herramienta o en la
lista del documento 09, se pone antes de fabricar.
