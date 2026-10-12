# 06 · Voz y sonido

## 1. Voz

- **Una sola voz para toda la cuenta**, con los mismos ajustes siempre. Es parte de la marca.
- Del idioma y el acento del público. Tono de explicación cercana, no de anuncio.
- Si es sintética: licencia que permita uso comercial, y la publicación se marca como
  contenido generado con IA donde la plataforma lo pida.

## 2. Locución por lotes

- **Una carpeta por lote**, con su texto y su audio dentro; nada de archivos sueltos.
- En el texto, **una frase por línea** y una línea en blanco entre vídeos.
- Se locuta el texto entero, sin cambiar el orden ni saltarse líneas, y el audio se guarda
  en la carpeta de ese lote.
- **Un lote repartido no se rehace**: el audio se corta contra ese texto exacto.
- Conviene tener voz grabada para varias semanas.

## 3. Corte y sincronía

- El audio se alinea con el texto mediante reconocimiento de voz y se corta frase a frase
  por el punto más silencioso entre dos frases.
- Se guardan los tiempos **de cada palabra**: los subtítulos van con la palabra, no con la frase.
- Entre frases se respeta **la pausa del locutor**, acotada entre 0,28 y 0,50 s. Antes de la
  primera, 0,3 s (el primer fotograma llega antes que la voz).
- **Si el locutor dijo dos líneas de corrido, no se separan**: un silencio metido ahí se oye
  como un corte.
- El final de cada frase conserva 90 ms de cola y todo trozo entra y sale con fundido.
- Tras «:» hay pausa: si falta, se abre una de 0,24 s.
- Cada frase se guarda suelta, para poder sustituir una sola.
- Velocidad: tal cual se grabó o, como mucho, un 6 % más rápida sin cambiar el tono.

## 4. Revisión automática (obligatoria)

Cada frase se vuelve a transcribir y se compara con el guion. No pasa si:

- lo oído se parece menos del **80 %** a lo escrito;
- el ritmo se sale de lo razonable para esa voz;
- hay un silencio de más de **0,6 s** dentro de una frase.

Una frase que no pasa se vuelve a locutar; no se parchea en el montaje.

## 5. Mezcla

| Pista | Nivel | Notas |
|---|---|---|
| Voz | −15 LUFS, pico −1,5 dB | siempre delante; **ganancia fija**, nunca normalización automática sobre la marcha |
| Música | 8-10 % del volumen | entra en 0,8 s, se va en 1,4 s; sin letra |
| Efectos | 25-75 % según el efecto | nunca tapan una sílaba |

## 6. Efectos de sonido

| Efecto | Cuándo |
|---|---|
| Paso (soplo corto) | cada cambio de plano |
| Barrido (soplo largo y grave) | entrada de una sección |
| Toque (nota corta) | cada rótulo que aparece |
| Campana suave | el cierre |

Discretos y **sincronizados al fotograma**. Si se notan como efectos, están altos.

## 7. Música

Solo pistas con licencia para uso comercial en redes y sin reclamaciones automáticas de
derechos; se anota de dónde sale cada una. Dos o tres pistas por cuenta bastan: la música
también es marca.
