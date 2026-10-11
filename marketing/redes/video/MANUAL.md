# Manual de edición de vídeos de Nokfi (TikTok · Reels)

> Documento vivo: se afina con cada vídeo publicado y con lo que digan las
> estadísticas. Última revisión: 2026-10-10 (v001).

## 0. Reglas fijas (del usuario)

- Se graba **la app real** (cuenta de ejemplo). Nada de caras ni imágenes generadas.
- **Todo gratis** (regla número 1 del usuario): herramientas locales y de código
  abierto o planes gratuitos; nada de servicios de pago.
- **Voz sintética fija** (2026-10-11): **Supertonic 3**, local y gratuita, voz `M1`
  (`voz.json`); sustituye a Piper, que sonaba rara. Al ser IA, esas publicaciones
  llevan la **etiqueta de IA de TikTok** (`"ia": true`; además lo exige la licencia
  del modelo). Si algún día graba el usuario, su archivo en `voz/` tiene prioridad.
- **Solo se cuenta lo que Nokfi ya tiene.** Las novedades se anuncian cuando
  estén confirmadas al 100 %.
- Objetivo: **viralizar** entre **negocios y autónomos** y entre
  **desarrolladores de automatizaciones con IA** (n8n, Make, Zapier, MCP).
- Ritmo: el usuario quiere **lanzar rápido** (2026-10-11 noche: 5 vídeos en media hora y el resto de la cola a uno por hora); antes, 2 al día (13:30 y 20:00) + 1 historia al día. Se hacen tandas nuevas cada semana.
- El usuario revisa cada vídeo antes de programarlo.

## 1. Cómo se hace un vídeo (tubería)

1. **Guion** `guiones/<id>.json`: gancho, escenas (clip + marca + frase de voz), cierre.
2. **Grabación de la app** (cuenta de ejemplo, datos ficticios):
   `cd backend && PLAYWRIGHT_CORE=… node scripts/redes-clips.js ../marketing/redes/video/guiones/<id>.json`
3. **Voz** (y, si el guion lleva tarjetas animadas, después `tarjetas.mjs`): `node marketing/redes/video/voz.mjs marketing/redes/video/guiones/<id>.json` → `voz/<id>.wav`
   (cifras y siglas escritas como se dicen en `locucion`; ver §6).
4. **Montaje**: `PLAYWRIGHT_CORE=… node marketing/redes/video/montar.mjs marketing/redes/video/guiones/<id>.json`
   → `salida/<id>/video.mp4` + `01-portada.png` + `subtitulos.srt`.
5. **Revisión** del usuario → `publicaciones/<semana>.json` con `"video": "video.mp4"` → `buffer.mjs`.

## 2. Estructura de cada vídeo (20-40 s)

| Tiempo | Qué | Regla |
|---|---|---|
| 0-0,5 s | **Imagen que frena el scroll** | Empezar ya en la pantalla con la cifra o el resultado, nunca en un menú |
| 0,5-2,5 s | **Gancho** (texto grande en caja azul + voz) | Tensión, no presentación. Nada de «Hola, soy…» |
| 2,5-25 s | **Demostración** | Un paso por frase, un toque visible por paso, cortes secos |
| final | **Recompensa** | La cifra, el resultado o el «ajá» |
| últimos 2-3 s | **Cierre** | Llamada a **compartir** («Envíaselo a…») + nokfi.app |

- El 71 % decide en los 3 primeros segundos: si el gancho no funciona, el
  resto da igual ([teleprompter.com](https://www.teleprompter.com/blog/tiktok-3-second-rule)).
- Mejor que el vídeo pueda **verse en bucle**: el cierre enlaza con el gancho.

## 3. Estilo visual

- 1080×1920, 30 fps, grabación de la app sin pérdida (PNG) y H.264 CRF 15. La app ocupa toda la pantalla.
- **Gancho**: Jakarta ExtraBold, blanco sobre caja azul Nokfi `#1456A2`, palabra
  clave en azul claro, arriba (zona segura: debajo de las pestañas de TikTok).
- **Subtítulos** (HTML/CSS): 1-3 palabras por golpe, Jakarta 800 a 82 px, caja negra redondeada al
  80 % con sombra, **palabra que se dice sobre azul Nokfi**, **palabra clave en amarillo** (`**así**`). Altura: por
  encima del texto de la publicación (abajo) y lejos de los botones (derecha).
- **Plano estable**: sin zoom continuo (decisión del usuario, 2026-10-11). **Nunca `zoomInicial`**: la app siempre a tamaño real, a todo el ancho y sin recortar por los lados (petición del usuario, 2026-10-11). `congelar` para quedarse en una cifra.
- Toques visibles (círculo blanco) en cada pulsación.
- Cortes secos, sin transiciones de PowerPoint.
- Siempre: «Cuenta de ejemplo con datos ficticios» en el texto de la publicación.

## 4. Ganchos (plantillas probadas, adaptadas a Nokfi)

Fórmula: **emoción o curiosidad + recompensa concreta + promesa implícita**.
Nombrar el dolor con las palabras del público en el primer segundo.

**Dolor / plazo (autónomos)**
- «¿Cuánto te toca pagar el **20 de octubre**?»
- «Si eres autónomo, este número te va a doler.»
- «El error que hace que **el IVA te pille sin dinero**.»
- «Llevas 3 meses sin mirar esto y en 10 días lo pagas.»

**Demo imposible / antes-después**
- «Le hago una **foto** a la factura y…» (y se ve cómo se apunta sola)
- «Esto antes me llevaba una tarde. Ahora, **10 segundos**.»
- «Mira lo que pasa cuando un cliente **no te paga**.»

**Curiosidad / secreto**
- «Nadie te cuenta esto del **modelo 130**.»
- «3 cosas que tu gestoría da por hecho que sabes.»
- «Si tienes un negocio, guárdate este vídeo.»

**Desarrolladores / automatización**
- «Conecté **n8n** a la contabilidad de un taller y pasó esto.»
- «Una API para que tu agente de IA **emita facturas** con VERI*FACTU.»
- «Le pedí a Claude por **MCP** cuánto debe pagar un autónomo…»
- «El nodo de n8n que nadie está usando todavía.»

**Contraste / opinión**
- «Excel está bien… hasta que llega el trimestre.»
- «No necesitas un programa de contabilidad. Necesitas saber **esta cifra**.»

Prohibido: «ahorra X €», promesas fiscales, asesoramiento personalizado,
anunciar funciones que no existen.

### Formatos probados (tanda 3, 2026-10-11) — anotar cuál funciona en §9
| Formato | Vídeo | Idea |
|---|---|---|
| Dato sorpresa + calculadora pública | v012 | «De esta factura, 210 € no son tuyos» |
| Pregunta-misterio | v013 | «¿Por qué cobro menos de lo que facturo?» |
| POV **sin voz** (solo texto y música; al no llevar voz sintética, sin etiqueta de IA) | v014 | «POV: mañana se paga el IVA» |
| Lista de 3 + «guárdalo» | v015 | «3 cosas que miro cada lunes» |
| Resultado personal | v016 | «Le he puesto nota a mi negocio: 61 sobre 100» |
| Plantilla lista (desarrolladores) | v017 | «Facturas de Gmail a Google Sheets, solas» |
| Mito roto | v018 | «Un sueldo de 1.500 € no te cuesta 1.500 €» |
| Prueba en directo (mal / bien) | v019 | «¿Tu factura vale? Depende de este número» |

### Edición avanzada: tarjetas animadas (tanda 4, desarrolladores, 2026-10-11)
`tarjetas.mjs` dibuja escenas animadas con HTML/CSS (después de `voz.mjs`, antes de `montar.mjs`): en el
guion, la escena lleva `"tarjeta"` en vez de `"clip"`. Tipos: `terminal` (comando que se teclea y
respuesta que aparece, con líneas resaltadas; sin comando es un archivo), `flujo` (nodos encadenados,
estilo n8n), `chat` (conversación con un agente y llamadas a herramientas MCP) y `datos` (cifras grandes).
`"barra": true` en el guion añade la barra de progreso. Reglas: los datos de las tarjetas son **respuestas
reales de la API** (se sacan del Playground en modo prueba); líneas de código de ≤ 41 caracteres; se
mezclan con planos de la app real; nunca enseñar la dirección `localhost` del Playground.

| Formato | Vídeo | Gancho |
|---|---|---|
| Terminal + Playground real | v020 | «Valida un NIF español con una sola llamada» |
| Chat con agente (MCP) + configuración | v021 | «Tu agente de IA no sabe facturar. Con esto, sí» |
| Flujo de nodos + respuesta real + plantillas | v022 | «Este flujo de n8n lee tus facturas solo» |
| Flujo con Trigger + calendario de la API | v023 | «Un aviso 7 días antes de cada plazo fiscal» |
| Entrada/salida de la API + Playground | v024 | «El modelo 130, calculado en una llamada» |

## 5. Pilares de contenido (1 vídeo al día)

| Día | Pilar | Ejemplos |
|---|---|---|
| Lun | **Demo de función** | Impuestos, cobros, previsión de caja, diagnóstico |
| Mar | **Tutorial** (cómo se hace) | Leer facturas con IA, emitir factura, exportar a la gestoría |
| Mié | **Autónomos: dolor + solución** | Plazos, cuánto apartar, impagos |
| Jue | **Desarrolladores** | API, n8n, MCP, webhooks, Playground |
| Vie | **Resumen de la app en 30 s** / novedad confirmada | |
| Sáb | **Calculadora gratis** (no hace falta cuenta) | Cuota de autónomos, IVA, precio por hora |
| Dom | **Pregunta / reacción / bucle** | «¿Tú cuánto apartas?», dúo con comentarios |

**Historias (1 al día)**: recordatorio de plazo, encuesta, «detrás de las
cámaras» o el vídeo del día recortado a 10-15 s con «nuevo vídeo 👆».
Ojo: la API de Buffer no publica historias de TikTok; las de TikTok se suben
desde la app (las dejo listas en `salida/`). Las de Instagram sí se programan.

## 6. La voz

**Sintética (por defecto):** `voz.json` fija el motor (`supertonic`), la voz
(`M1`; hay M1-M5 y F1-F5), los pasos de calidad (16), la velocidad (**1,12** desde el
2026-10-11: el usuario quiere ritmo ágil, sin pasarse) y la pausa entre frases (0,4 s). `voz.mjs` guarda además `voz/<id>.tiempos.json` con
el inicio y fin exactos de cada frase, y el montador los usa para los subtítulos.
Reglas para que suene natural y dé confianza: frases cortas (≤ 14 palabras),
cifras y siglas escritas como se pronuncian en `locucion` («cinco mil novecientos
sesenta euros», «i erre pe efe»), tono de explicación cercana, nada de
exclamaciones seguidas. Pendiente de afinar: el acento tira a neutro/latino
(probar M2-M5 y la velocidad). Piper sigue disponible con `"motor": "piper"`.

Aprendido con los vídeos de prueba (2026-10-11, oído del usuario):
- «Nokfi» suena mejor **al final de una frase corta** («…de la API de Nokfi.»,
  «Abro los cobros de Nokfi.») que al principio. No empezar frases con «Nokfi».
- Cifras largas hacen pausas raras («3.448»): **redondear** al hablar («casi tres
  mil quinientos») y dejar la cifra exacta en pantalla.
- Pausa breve dentro de una frase: barra ` | ` en `locucion` («…en Nokfi. | Finanzas e impuestos.»).
- IVA e IRPF suenan perfectos tal como están en `voz.json`. «Excel» se locuta como «Excél» (acento al final).
- «IA» al final de frase suena «ia-a»: escribir «inteligencia artificial» en `locucion`. «API» solo dentro de «la API de Nokfi».
- Tras cada «:» va sola una pausa muy corta (0,16 s, `pausaDosPuntos`): «Resultado: | mil doscientos euros».
- «webhooks» se locuta «webjuks». Porcentajes al final de la frase («…llega al ochenta por ciento»).
- Cada frase locutada se guarda en `voz/.tomas/`: al rehacer un vídeo, las frases
  que no cambian suenan idénticas. Si una frase sale mal, `--repetir <n>` la
  locuta de nuevo (cada toma sale algo distinta).

**Grabada por una persona (si algún día):**

- Misma persona, mismo sitio y mismo micro siempre (el móvil vale).
- Habitación con cortinas, sofá o armario abierto (menos eco); móvil a un palmo,
  ligeramente de lado.
- Leer las frases del guion **en orden**, con **1 segundo de silencio entre
  frases** (el montador corta por los silencios para poner cada frase en su escena).
- Tono: como se lo contarías a un amigo, con energía al principio.
- Guardar como `marketing/redes/video/voz/<id>.m4a` (o .mp3/.wav/.ogg).
- Si una frase sale mal, repetir el archivo entero (más fácil de montar).

## 7. Música

- Solo pistas con licencia para uso comercial en redes (p. ej. la biblioteca de
  Pixabay Music o la Audio Library de YouTube, revisando la licencia de cada una).
- Se guardan en `video/musica/` (no se versionan). Debajo de la voz baja sola.
- Alternativa: subir el vídeo sin música y añadir un sonido de la **biblioteca
  comercial de TikTok** desde la app (las cuentas de empresa solo pueden usar esa).

## 8. Lista de comprobación antes de mandar a revisión

- [ ] Gancho en pantalla antes de 0,5 s y legible sin sonido.
- [ ] Ningún subtítulo tapa la cifra importante.
- [ ] Todas las cifras son de la cuenta de ejemplo y cuadran con lo que se dice.
- [ ] Nada fuera de la zona segura (arriba 220 px, abajo 400 px, derecha 140 px).
- [ ] Cierre con llamada a compartir + nokfi.app.
- [ ] Texto de la publicación: qué es, «cuenta de ejemplo», 3-5 hashtags.
- [ ] Duración 20-40 s (más largo solo para tutoriales).

## 9. Aprendizajes (se rellena tras cada publicación)

| Vídeo | Retención 3 s | Visualizaciones | Compartidos | Qué cambiar |
|---|---|---|---|---|
| v001 | | | | |
| v002 | | | | |
| v003 | | | | |
| v004 | | | | |
| v005 | | | | |
| v006 | | | | |
| v007 | | | | |
| v008 | | | | |
| v009 | | | | |
| v010 | | | | |
| v011 | | | | |
| v012 | | | | |
| v013 | | | | |
| v014 | | | | |
| v015 | | | | |
| v016 | | | | |
| v017 | | | | |
| v018 | | | | |
| v019 | | | | |
| v020 | | | | |
| v021 | | | | |
| v022 | | | | |
| v023 | | | | |
| v024 | | | | |
