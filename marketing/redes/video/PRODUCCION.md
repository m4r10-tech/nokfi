# Producción de vídeos de Nokfi

> Norma de trabajo para los vídeos de TikTok (@nokfi4). Si algo de aquí choca con lo que se
> está haciendo, se cambia lo que se está haciendo o se cambia este documento, pero no se
> trabaja al margen. Última revisión: 2026-10-12.
>
> Estado de cada vídeo: [`ESTADO.md`](ESTADO.md) (lo genera `estado.py`).

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
6. **Todo gratis** salvo decisión expresa de Mario (la voz de ElevenLabs lo es).
7. **El ordenador manda sobre la prisa.** Un proceso pesado cada vez, a dos núcleos y por
   debajo de 70 °C (ver §9).

## 2. Quién hace qué

| Tarea | Quién |
|---|---|
| Guiones, grabación de la app, tarjetas, montaje, revisión técnica | Claude |
| Locución: pegar el texto del lote en ElevenLabs y dejar el audio | Mario |
| Visto bueno de cada lote | Mario |
| Programar y publicar en Buffer / TikTok | Mario |
| Anotar estadísticas y decidir qué formatos se repiten | Mario, con Claude |

## 3. Carpetas

```
marketing/redes/
├── README.md              entrada: qué hay y dónde
├── guia-estilo.md         tono, bios, enlaces, lo que nunca decimos
├── buffer.mjs             herramienta de Buffer (uso manual, ver §8)
├── publicaciones/         registro de lo enviado a Buffer (histórico)
├── plantillas/            portadas (render.mjs)
├── archivo/               etapa de imágenes para X/Instagram, abandonada
├── video/
│   ├── PRODUCCION.md      este documento
│   ├── ESTADO.md          tablero (generado)
│   ├── guiones/           un JSON por vídeo + _biblio.json (planos reutilizables)
│   ├── voz/               audio por vídeo (no versionado)
│   ├── musica/, fuentes/  recursos (licencias en musica-licencias.md)
│   └── *.mjs, *.py        herramientas (ver §4)
└── salida/                no versionado
    ├── vNNN-…/            video.mp4, 01-portada.png, subtitulos.srt
    ├── video/             grabaciones de la app (clips) y biblioteca de planos
    ├── lotes-voz/         lote-NN.txt (texto) y lote-NN.mp3 (audio de Mario)
    ├── _hojas/            hoja de contactos de cada vídeo (6 fotogramas)
    ├── _registro/         registros antiguos
    └── _archivo/          muestras de voz y piezas de imagen antiguas
```

Nombres: `vNNN-tema-en-minusculas`. El número no se reutiliza aunque un vídeo se descarte.

## 4. El proceso, paso a paso

Cada paso tiene una condición de salida. Si no se cumple, no se pasa al siguiente.

| # | Paso | Herramienta | Sale cuando… |
|---|---|---|---|
| 1 | **Guion** | `guiones/<id>.json` | cumple §5 y todas las cifras están comprobadas en la app |
| 2 | **Planos de la app** | `backend/scripts/redes-clips.js` | cada plano empieza en la pantalla útil, a tamaño real, sin datos reales |
| 3 | **Texto del lote** | `lotes_voz.py` → `salida/lotes-voz/lote-NN.txt` | una frase por línea, cifras y siglas escritas como se dicen |
| 4 | **Locución** | Mario, en ElevenLabs → `lote-NN.mp3` | misma voz y mismos ajustes que el lote anterior |
| 5 | **Corte** | `partir_audio.py lote-NN <audio>` | los 8 vídeos salen `OK` (ninguna frase por debajo del 80 %) |
| 6 | **Revisión de audio** | `revisa_audio.py <id>…` | `OK`: lo que se oye es lo que dice el guion, sin huecos ni ritmo raro |
| 7 | **Tarjetas** (si hay) | `tarjetas.mjs` | texto dentro de márgenes, datos reales |
| 8 | **Montaje** | `montar.mjs` (o `serie.py --sin-cola <ids>`, que encadena 6-8 y vigila la temperatura) | `video.mp4` 1080×1920 con voz, música, subtítulos y portada |
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
python3 marketing/redes/video/lotes_voz.py
marketing/redes/video/.asr/bin/python marketing/redes/video/partir_audio.py lote-02 ~/Descargas/lote-02.mp3 --prueba
marketing/redes/video/.asr/bin/python marketing/redes/video/partir_audio.py lote-02 ~/Descargas/lote-02.mp3

# 6-8 · revisar, tarjetas y montar, despacio
taskset -c 0,1 nice -n 19 ionice -c 3 python3 marketing/redes/video/serie.py --sin-cola <id> <id> …

# tablero                              ver los vídeos en el navegador
python3 marketing/redes/video/estado.py
cd marketing/redes/salida && python3 -m http.server 8765 --bind 127.0.0.1
```

## 5. Norma del guion

**Estructura (15-30 s; hasta 40 s solo en tutoriales)**

| Tiempo | Qué | Regla |
|---|---|---|
| 0-0,5 s | Imagen que frena el dedo | Empezar ya en la cifra o el resultado, nunca en un menú |
| 0,5-2,5 s | Gancho (texto grande + voz) | Tensión, no presentación. Nada de «Hola, soy…» |
| 2,5 s → | Demostración | Una idea por frase, un toque visible por paso, cortes secos |
| final | Recompensa | La cifra, el resultado o el «ajá» |
| últimos 2-3 s | Cierre | Llamada a compartir o comentar + nokfi.app |

**Frases**: 5-6 por vídeo, de 14 palabras como mucho, en el tono de contárselo a un amigo.
El cierre enlaza con el gancho para que el vídeo aguante en bucle.

**Ganchos**: emoción o curiosidad + recompensa concreta, con las palabras del público.

- Dolor o plazo: «¿Cuánto te toca pagar el **20 de octubre**?» · «El error que hace que el IVA te pille sin dinero.»
- Demostración: «Le hago una **foto** a la factura y…» · «Esto antes me llevaba una tarde. Ahora, 10 segundos.»
- Curiosidad: «Nadie te cuenta esto del **modelo 130**.» · «Si tienes un negocio, guárdate este vídeo.»
- Desarrolladores: «Valida un NIF español con una sola llamada.» · «Tu agente de IA no sabe facturar. Con esto, sí.»
- Contraste: «Excel está bien… hasta que llega el trimestre.»

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

- **Voz**: la de ElevenLabs que elige Mario, siempre la misma y con los mismos ajustes.
  Castellano de España. La voz sintética antigua (Supertonic) queda solo como herramienta
  de pruebas: no se publica nada nuevo con ella.
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
- **Licencia**: antes de publicar, comprobar que el plan de ElevenLabs con el que se generó
  el audio permite uso comercial.

## 7. Control de calidad

**Audio (automático, obligatorio)**: `revisa_audio.py` transcribe cada frase con Whisper y
la compara con el guion. Falla si se parece menos del 80 %, si el ritmo se sale de rango o
si hay un silencio de más de 0,6 s dentro de una frase. Un vídeo con una frase en `MAL` no
pasa: se corrige el texto del lote y se vuelve a locutar esa parte.

**Imagen (lista, sobre el vídeo y su hoja de contactos)**

- [ ] El gancho está en pantalla antes de 0,5 s y se entiende sin sonido.
- [ ] La app sale a tamaño real, a todo el ancho, sin recortes (nunca `zoomInicial`).
- [ ] Ningún subtítulo tapa la cifra importante.
- [ ] Lo que se dice coincide con lo que se ve en ese momento.
- [ ] Nada fuera de la zona segura (arriba 220 px, abajo 400 px, derecha 140 px).
- [ ] No aparece ningún dato real, ni `localhost`, ni pantallas a medio cargar o con «0,00 €».
- [ ] Las tarjetas caben en sus márgenes (líneas de código de 41 caracteres como mucho).
- [ ] Cierre con llamada a la acción y nokfi.app.
- [ ] Duración entre 12 y 40 s; la música no tapa la voz.

**Estilo fijo**: 1080×1920 a 30 fps · gancho en Jakarta ExtraBold blanco sobre azul Nokfi
`#1456A2` · subtítulos de 1-3 palabras con la palabra dicha sobre azul y la palabra clave en
amarillo · plano estable, sin zoom continuo · toques visibles · cortes secos · barra de
progreso opcional (`"barra": true`).

**Música**: solo las pistas de `musica-licencias.md` (Pixabay, uso comercial, sin Content ID).

## 8. Publicación

- La lleva **Mario en Buffer**. No hay ningún proceso automático que programe, rellene o
  retire publicaciones (el cron de `rellenar-cola.sh` está quitado desde el 2026-10-12).
- Ritmo acordado: una publicación cada 4-5 horas (**09:00, 13:30, 18:00, 22:30**).
- Buffer gratis admite **10 publicaciones programadas** y su API **250 peticiones al día**;
  por eso no se consulta en bucle.
- `buffer.mjs` queda como herramienta manual, solo si Mario lo pide:
  `revisar` (comprueba un archivo de publicaciones), `subir` (sube los vídeos al servidor) y
  `programar`. `rellenar` no se usa mientras exista `salida/COLA-EN-PAUSA`.
- Para subir a mano: el vídeo está en `salida/<id>/video.mp4`, la portada en
  `01-portada.png` y el texto en el campo `texto` del guion.

## 9. Cuidado del equipo

Portátil de 4 núcleos, 8 GB y sin gráfica, que se apaga por calor.

- Un solo proceso pesado a la vez (grabar, transcribir o montar; nunca dos).
- Siempre `taskset -c 0,1 nice -n 19 ionice -c 3`.
- `serie.py` detiene el trabajo a 70 °C y lo reanuda a 60 °C, y descansa entre vídeos.
- Whisper a 2 hilos. Nada de modelos de voz grandes en local.
- La producción en serie solo arranca sola si **no** existe `salida/SERIE-EN-PAUSA`
  (`continuar-serie.sh`, cron cada 30 min). Hoy existe: todo se lanza a mano.

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
