# Producción de vídeos de Nokfi

> Norma de trabajo para los vídeos de TikTok (@nokfi4). Si algo de aquí choca con lo que se
> está haciendo, se cambia lo que se está haciendo o se cambia este documento, pero no se
> trabaja al margen. Última revisión: 2026-10-12.
>
> Estado de cada vídeo: [`ESTADO.md`](ESTADO.md) (lo genera `video/herramientas/estado.py`).

## 0. El flujo en una página (acordado el 2026-10-12)

```
 A. EXISTENCIAS                        B. FABRICACIÓN                  C. ENTREGA
 ┌──────────────────────────┐          ┌─────────────────────┐         ┌──────────────────────────┐
 │ Grabaciones de TODA la   │          │ Guion (gancho real) │         │ salida/PARA-SUBIR/       │
 │ app, a 1080 de ancho     │─────────▶│ + voz + grabaciones │────────▶│ vídeo + texto listos     │
 │ Lotes de voz de Mario    │          │ = edición premium   │         │ para arrastrar a TikTok  │
 │ (ElevenLabs, plan de     │          │ → control de calidad│         │ (o modo viaje, §8)       │
 │ uso comercial)           │          └─────────────────────┘         └──────────────────────────┘
 └──────────────────────────┘
```

- **Primero existencias, luego vídeos.** Se acumulan muchas grabaciones de la app y muchos
  lotes de voz; con eso en la despensa, montar un vídeo es rápido y no depende de nadie.
- **Edición de primera**: realista y con mucha animación, como un encargo caro (§7).
- **Mario sube a mano** arrastrando desde `salida/PARA-SUBIR/`. Buffer automático solo como
  «modo viaje», cuando él lo diga (§8).
- **Nunca más ráfagas**: TikTok penalizó la cuenta por publicar muchos vídeos seguidos (§8).

## 1. Principios

1. **Lotes pequeños y cerrados.** Se trabaja en lotes de 8 vídeos. Un lote no empieza hasta
   que el anterior está visto y aprobado. Nada de producir decenas de vídeos sin revisar:
   un defecto (una voz, una tarjeta) se multiplica por todos.
2. **Nada se publica sin el visto bueno de Mario.** Ni automatizaciones que publiquen solas
   ni colas que se rellenen solas.
3. **Solo se enseña lo que Nokfi ya hace**, grabado en la app real con la cuenta de ejemplo
   («Taller García», datos ficticios). Sin caras ni imágenes generadas.
4. **Cada cifra que se dice se ve en pantalla** y sale de la app o de una respuesta real de
   la API. Los cálculos son orientativos y así se dice en el texto de la publicación.
5. **Todo vídeo lleva voz.** Nunca solo música.
6. **Gratis por defecto.** La única herramienta de pago es la voz: ElevenLabs, con el plan
   de Mario que permite uso publicitario.
7. **El ordenador manda sobre la prisa.** Un proceso pesado cada vez, a dos núcleos y por
   debajo de 70 °C (ver §9).

## 2. Quién hace qué

| Tarea | Quién |
|---|---|
| Guiones, grabación de la app, tarjetas, montaje, revisión técnica | Claude |
| Locución: pegar el texto del lote en ElevenLabs y dejar el audio (cuantos más lotes en reserva, mejor) | Mario |
| Visto bueno de cada lote | Mario |
| Subir a TikTok arrastrando desde `salida/PARA-SUBIR/` | Mario |
| Modo viaje (Buffer automático), solo cuando Mario lo pide | Claude |
| Anotar estadísticas y decidir qué formatos se repiten | Mario, con Claude |

## 3. Carpetas

Ningún archivo suelto: cada cosa tiene su carpeta. Solo `README.md` vive en la raíz.

```
marketing/redes/
├── README.md               entrada: qué hay y dónde
├── docs/                   PRODUCCION.md (esto), ESTADO.md (tablero), guia-estilo.md, musica-licencias.md
├── video/
│   ├── guiones/            un JSON por vídeo + _biblio.json (planos reutilizables)
│   ├── herramientas/       montar, tarjetas, serie, lotes_voz, partir_audio, revisa_audio, estado
│   ├── recursos/           fuentes/ y musica/
│   └── voz/                audio cortado por vídeo (no versionado)
├── plantillas/             portadas (render.mjs)
├── buffer/                 buffer.mjs, .env (claves) y publicaciones/ (registro de lo enviado)
└── salida/                 no versionado
    ├── vNNN-…/             video.mp4, 01-portada.png, subtitulos.srt
    ├── video/              grabaciones de la app (clips) y biblioteca de planos
    ├── lotes-voz/          lote-NN.txt (texto) y lote-NN.mp3 (audio de Mario)
    ├── _hojas/             hoja de contactos de cada vídeo (6 fotogramas)
    ├── _control/           COLA-EN-PAUSA, pendientes y dudosos
    ├── _registro/          serie.log
    └── _PAPELERA/          lo retirado en la limpieza; se puede borrar entero
```

Nombres: `vNNN-tema-en-minusculas`. El número no se reutiliza aunque un vídeo se descarte.
Un archivo nuevo va a su carpeta; si no encaja en ninguna, se crea la carpeta antes que el archivo.

## 3b. Existencias: grabaciones y voz

**Biblioteca de grabaciones** (`salida/video/_biblio/`, índice en `video/guiones/_biblio.json`).
Objetivo: tener grabado **cada apartado de la app**, con varias tomas por pantalla (entrada,
acción principal, resultado, detalle), para poder montar sin volver a grabar.

| Zona | Apartados que hay que cubrir |
|---|---|
| Negocio | Inicio · Finanzas (impuestos, cobros, previsión de caja, gastos fijos) · Libro y lectura de facturas · Emitir factura · Calendario fiscal · Diagnóstico · Exportar a PDF/Excel · Ajustes |
| Web pública | Portada · calculadoras (IVA, retención, cuota de autónomos, coste de un empleado, precio por hora) · validador de NIF · calendario · precios |
| Desarrolladores | Claves · Playground · webhooks · plantillas de n8n · uso y cuota · documentación |

Hoy hay 42 planos; el inventario de lo que falta se hace antes de grabar la siguiente tanda.
Cada plano nuevo: 1080 px de ancho, cuenta de ejemplo, sin datos reales, sin pantallas a medio
cargar.

**Reserva de voz** (`salida/lotes-voz/`). Textos por lotes de menos de 2.400 caracteres;
Mario los locuta cuando puede y deja `lote-NN.mp3`. Un lote repartido no se rehace.

## 4. El proceso, paso a paso

Cada paso tiene una condición de salida. Si no se cumple, no se pasa al siguiente.

| # | Paso | Herramienta | Sale cuando… |
|---|---|---|---|
| 1 | **Guion** | `guiones/<id>.json` | cumple §5 y todas las cifras están comprobadas en la app |
| 2 | **Planos de la app** | `backend/scripts/redes-clips.js` | cada plano empieza en la pantalla útil, a tamaño real, sin datos reales |
| 3 | **Texto del lote** | `lotes_voz.py` → `salida/lotes-voz/lote-NN.txt` | una frase por línea; un lote ya repartido no se rehace |
| 4 | **Locución** | Mario, en ElevenLabs → `lote-NN.mp3` | misma voz y mismos ajustes que el lote anterior |
| 5 | **Corte** | `partir_audio.py lote-NN <audio>` | los 8 vídeos salen `OK` (ninguna frase por debajo del 80 %) |
| 6 | **Revisión de audio** | `revisa_audio.py <id>…` | `OK`: lo que se oye es lo que dice el guion, sin huecos ni ritmo raro |
| 7 | **Tarjetas** (si hay) | `tarjetas.mjs` | texto dentro de márgenes, datos reales |
| 8 | **Montaje** | `serie.py <ids>` (encadena 6-8 y vigila la temperatura) | `video.mp4` 1080×1920 con voz, música, subtítulos y portada |
| 9 | **Revisión visual** | hoja de `_hojas/` + lista de §7 | todos los puntos marcados |
| 10 | **Visto bueno** | Mario ve los 8 vídeos | aprobado, o lista de cambios (se vuelve al paso que toque) |
| 11 | **Publicación** | Mario, en Buffer | programado con la etiqueta de IA |
| 12 | **Aprendizaje** | §10 | a los 3-7 días, cifras apuntadas |

Órdenes (desde la raíz del repo):

```bash
# 2 · grabar planos (no grabar mientras hay un montaje en marcha: da tiempos de espera)
cd backend && PLAYWRIGHT_CORE=$(realpath ../../n8n-nodes-nokfi/node_modules/playwright-core) \
  node scripts/redes-clips.js ../marketing/redes/video/guiones/<id>.json

# 3 · textos para locutar            5 · cortar el audio que deja Mario
python3 marketing/redes/video/herramientas/lotes_voz.py
marketing/redes/video/.asr/bin/python marketing/redes/video/herramientas/partir_audio.py lote-02 ~/Descargas/lote-02.mp3 --prueba
marketing/redes/video/.asr/bin/python marketing/redes/video/herramientas/partir_audio.py lote-02 ~/Descargas/lote-02.mp3

# 6-8 · revisar, tarjetas y montar, despacio
taskset -c 0,1 nice -n 19 ionice -c 3 python3 marketing/redes/video/herramientas/serie.py <id> <id> …

# tablero                              ver los vídeos en el navegador
python3 marketing/redes/video/herramientas/estado.py
cd marketing/redes/salida && python3 -m http.server 8765 --bind 127.0.0.1
```

## 5. Norma del guion

**Estructura (25-45 s: guion algo más largo que en las primeras tandas, a petición de Mario)**

| Tiempo | Qué | Regla |
|---|---|---|
| 0-0,5 s | Imagen que frena el dedo | Empezar ya en la cifra o el resultado, nunca en un menú |
| 0,5-2,5 s | Gancho (texto grande + voz) | Tensión, no presentación. Nada de «Hola, soy…» |
| 2,5 s → | Demostración | Una idea por frase, un toque visible por paso, cortes secos |
| final | Recompensa | La cifra, el resultado o el «ajá» |
| últimos 2-3 s | Cierre | Llamada a compartir o comentar + nokfi.app |

**Frases**: 7-10 por vídeo, de 14 palabras como mucho, en el tono de contárselo a un amigo.
Más largo no es más lento: cada frase añade un dato o un paso, nunca relleno.
El cierre enlaza con el gancho para que el vídeo aguante en bucle.

**Ganchos y métodos**: ver [`GANCHOS.md`](GANCHOS.md) (tipos que funcionan, con fuentes, y
plantillas adaptadas a Nokfi). Todo guion nuevo declara qué tipo de gancho usa.

**Prohibido**: «ahorra X €», promesas fiscales, asesoramiento personalizado, funciones que
no existen, la dirección `localhost` del Playground, cualquier dato de un cliente real.

**Variedad**: cada 5 vídeos cambia el formato (gancho, estructura y recurso visual). Los 20
formatos de la serie v025-v124: verdad o mito · POV narrado · antes/ahora · tutorial en 3
pasos · notificación · glosario · checklist · gráfico de barras · pregunta al espectador ·
el error · recorrido rápido · historia en tres actos · cifra gigante · quiz · terminal +
Playground · chat con agente (MCP) · flujo de nodos (n8n) · calendario · a mano contra la
API · dos casos en la misma calculadora.

**Texto de la publicación**: qué se ve, «cálculo orientativo» o «cuenta de ejemplo con datos
ficticios», una llamada a compartir y 3-5 etiquetas.

## 6. Norma de la voz

- **Voz**: la de ElevenLabs que elige Mario (plan con licencia de uso publicitario), siempre
  la misma y con los mismos ajustes.
  Castellano de España. Los motores de voz locales (Supertonic, Piper) se retiraron.
- **Cómo se locuta**: un archivo por lote (`lote-NN.txt` entero, sin cambiar el orden ni
  saltarse líneas). Nombre del audio: `lote-NN.mp3`, en Descargas o en `salida/lotes-voz/`.
- **Ritmo**: ágil sin correr. `partir_audio.py` acelera un 6 % sin cambiar el tono
  (`TEMPO`) y deja 0,30 s entre frases.
- **Texto para locutar** (`locucion` en el guion):
  - cifras en letra y redondeadas («casi tres mil quinientos»); la exacta va en pantalla;
  - «Nokfi» al final de una frase corta, nunca al principio;
  - «inteligencia artificial» en vez de «IA» a final de frase;
  - porcentajes al final de la frase;
  - `|` marca una pausa breve; tras «:» va una pausa muy corta.
- **Etiqueta de IA**: toda publicación con voz sintética se marca como contenido generado
  con IA en TikTok.
- **Reserva de voz**: se preparan lotes por adelantado (`lotes_voz.py`), de forma que
  siempre haya voz grabada para varias semanas de vídeos.

## 7. Control de calidad

**Audio (automático, obligatorio)**: `revisa_audio.py` transcribe cada frase con Whisper y
la compara con el guion. Falla si se parece menos del 80 %, si el ritmo se sale de rango o
si hay un silencio de más de 0,6 s dentro de una frase. Un vídeo con una frase en `MAL` no
pasa: se corrige el texto del lote y se vuelve a locutar esa parte.

**Imagen (lista, sobre el vídeo y su hoja de contactos)**

- [ ] El gancho está en pantalla antes de 0,5 s y se entiende sin sonido.
- [ ] La app se ve nítida y completa (sin recortes ni ampliaciones borrosas) y con aire a los lados.
- [ ] La letra no es grande de más y respeta el margen lateral.
- [ ] Ningún subtítulo tapa la cifra importante.
- [ ] Lo que se dice coincide con lo que se ve en ese momento.
- [ ] Nada fuera de la zona segura (arriba 220 px, abajo 400 px, derecha 140 px).
- [ ] No aparece ningún dato real, ni `localhost`, ni pantallas a medio cargar o con «0,00 €».
- [ ] Las tarjetas caben en sus márgenes (líneas de código de 41 caracteres como mucho).
- [ ] Cierre con llamada a la acción y nokfi.app.
- [ ] Duración entre 12 y 40 s; la música no tapa la voz.

**Estilo (cambia el 2026-10-12; lo anterior queda superado)**

- 1080×1920 a 30 fps. Grabaciones de la app a **1080 px de ancho reales** (móvil 360×780 a 3×
  → 1080×2340), nunca ampliadas ni borrosas.
- **Aire a los lados**: ni la app ni los textos van pegados al borde. Margen lateral mínimo
  de 64 px para el texto; la app puede ir enmarcada (esquinas redondeadas, sombra, fondo de
  marca) en vez de ocupar toda la pantalla.
- **Letra contenida**: subtítulos y titulares más pequeños que en las primeras tandas
  (subtítulos ≈ 52-58 px en vez de 82; gancho en dos líneas como mucho). Que se lea bien
  en el móvil sin gritar.
- **Edición realista y muy animada**, nivel de encargo profesional:
  - acercamientos suaves hacia donde ocurre la acción (el toque, la cifra) y vuelta;
  - cursor/toque visible con estela; resaltado de la cifra o el campo del que se habla;
  - cifras que cuentan hasta su valor; rótulos y flechas que entran con muelle;
  - transiciones con sentido (deslizar, fundir con desenfoque), nunca de plantilla;
  - subtítulos cinéticos sincronizados palabra a palabra;
  - efectos de sonido discretos (toque, deslizamiento, acierto) bajo la voz;
  - marco de dispositivo y fondos de marca cuando el plano lo pida.
- **Herramienta de edición**: por decidir con un vídeo piloto. Candidatas: Remotion (vídeo
  programado en React; gratis para particulares y empresas de hasta 3 personas) o seguir con
  el montador propio (HTML/CSS + ffmpeg) ampliado. Criterio: calidad del resultado y que el
  portátil lo aguante (§9).

**Música**: solo las pistas de `docs/musica-licencias.md` (Pixabay, uso comercial, sin Content ID).

## 8. Publicación

**Modo normal: a mano.** Cada vídeo aprobado se deja en `salida/PARA-SUBIR/NNN-tema/` con
`video.mp4`, `portada.png` y `texto.txt` (texto de la publicación y etiquetas). Mario lo
arrastra a TikTok y, al subirlo, mueve la carpeta a `salida/SUBIDOS/`. Así la carpeta
`PARA-SUBIR` es siempre la cola real, en orden.

**Ritmo.** TikTok **penalizó la cuenta** por publicar muchos vídeos seguidos (11-12 de
octubre: cinco en cuatro minutos y luego uno por hora; los siguientes se quedaron en 0-10
visualizaciones). Reglas desde entonces:

- **Nunca menos de 4-5 horas entre dos vídeos.** Huecos: 09:00, 13:30, 18:00 y 22:30.
- Recomendación de Claude mientras la cuenta se recupera: 1-2 vídeos al día y ninguno durante
  48 horas tras un parón de visitas (ver fuentes en `GANCHOS.md` §4). La decisión es de Mario.
- Constancia antes que volumen: mejor uno diario siempre que cuatro un día y ninguno después.

**Modo viaje: Buffer automático.** Solo cuando Mario lo pida («lanza el modo viaje»), si se
va de viaje o no puede subir:

1. Se toma `PARA-SUBIR` en orden, **a partir del último vídeo publicado**.
2. Se programan en Buffer respetando los huecos de 4-5 horas (como mucho 10 a la vez, que es
   el tope del plan gratuito; el resto entra según se vacían).
3. Límite de la API: 250 peticiones al día. Nada de consultas en bucle: una pasada al
   programar y, como mucho, una al día para reponer.
4. Al volver, Mario dice «para el modo viaje» y se retira lo que quede programado.

Estado actual: `salida/_control/COLA-EN-PAUSA` existe, así que `buffer.mjs rellenar` no hace
nada. El modo viaje está descrito pero **aún no está construido** con este diseño.

## 9. Cuidado del equipo

Portátil de 4 núcleos, 8 GB y sin gráfica, que se apaga por calor.

- Un solo proceso pesado a la vez (grabar, transcribir o montar; nunca dos).
- Siempre `taskset -c 0,1 nice -n 19 ionice -c 3`.
- `serie.py` detiene el trabajo a 70 °C y lo reanuda a 60 °C, y descansa entre vídeos.
- Whisper a 2 hilos. Nada de modelos de voz grandes en local.
- Nada arranca solo: no hay cron. Todo se lanza a mano y por lotes.

## 10. Aprendizajes

Se apunta a los 3-7 días de publicar. Lo que funciona se repite en el siguiente lote; lo que
no, se deja de hacer.

| Vídeo | Formato | Visualizaciones | Retención 3 s | Compartidos | Qué cambiar |
|---|---|---|---|---|---|
| | | | | | |

Ya aprendido:

- TikTok sirve los vídeos a 576×1024 aunque se suba más calidad: no merece la pena subir
  archivos más pesados.
- Las voces sintéticas gratuitas probadas (Supertonic, Kokoro) sesean; Piper es castellano
  pero suena menos natural. Por eso la voz se genera fuera.
- Producir 49 vídeos antes de aprobar la voz obligó a rehacerlos todos: de ahí el principio 1.
- Automatizar la cola contra Buffer cada 10 minutos agotó el cupo diario de la API y dejó
  la cola sin poder corregirse: de ahí el principio 2 y el §8.
- Publicar en ráfaga hundió el alcance de la cuenta (0-10 visualizaciones por vídeo): de ahí
  el ritmo del §8.
