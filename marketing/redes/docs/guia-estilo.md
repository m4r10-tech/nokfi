# Nokfi en redes — guía de estilo

> Sesión 13 (2026-10-03). Redes: **X, Instagram y TikTok**. Se publica con
> **Buffer** y **nada sale sin el ok del usuario** (borrador → revisión →
> programado). Sin publicidad de pago por ahora.

---

## 1. Perfil en cada red

Nombre de usuario recomendado: **@nokfiapp** en las tres (si está cogido,
`@nokfi.app` en Instagram/TikTok y `@nokfi_app` en X). Mismo nombre en todas.

| Red | Nombre visible | Bio (límite) | Enlace |
|---|---|---|---|
| X | Nokfi | ver abajo (160) | `https://nokfi.app/?utm_source=x&utm_medium=social&utm_campaign=bio` |
| Instagram | Nokfi · finanzas para autónomos | ver abajo (150) | `https://nokfi.app/?utm_source=instagram&utm_medium=social&utm_campaign=bio` |
| TikTok | Nokfi | ver abajo (80) | `https://nokfi.app/?utm_source=tiktok&utm_medium=social&utm_campaign=bio` |

**X (≤160):**
> Lee tus facturas, te dice cuánto apartar para Hacienda y quién te debe. Para autónomos y pymes en España. Prueba 14 días gratis 👇

**Instagram (≤150):**
> Facturas, IVA, IRPF y caja sin líos 📊
> Para autónomos y pymes en España
> Consejos cada semana · Prueba 14 días gratis 👇

**TikTok (≤80):**
> Tus números de autónomo, claros. Consejos cada semana 👇

Categoría (Instagram, cuenta profesional): *Software* / *Aplicación*.
Correo de contacto visible: `info@nokfi.app`.

### Enlaces dentro de publicaciones
Siempre a una página pública concreta, con UTM de la red y la publicación:

```
https://nokfi.app/<página>?utm_source=<x|instagram|tiktok>&utm_medium=social&utm_campaign=<AAAA-MM-DD-tema>
```

La web suma `ref_x`, `ref_instagram` o `ref_tiktok` por página de llegada (sin
cookies) y sale en el informe diario: «Entradas desde redes».

Páginas útiles para enlazar: `/calculadora-cuota-autonomos`, `/calculadora-iva`,
`/calculadora-retencion-irpf`, `/calculadora-coste-empleado`,
`/calculadora-precio-hora`, `/calendario-fiscal-2026`, `/validar-nif`,
`/guias/modelo-303-iva-trimestral`, `/guias/modelo-130-pago-fraccionado-irpf`,
`/guias/cuanto-apartar-para-impuestos`, `/guias/iva-a-compensar`,
`/guias/gastos-deducibles-autonomos`, `/guias/como-hacer-una-factura`,
`/guias/factura-electronica-y-verifactu`, `/guias/reclamar-factura-impagada`.

> Instagram y TikTok no enlazan desde el texto: se dice «enlace en la bio» y la
> bio apunta a la página del tema de la semana cuando haga falta.

---

## 2. Identidad visual

- **Azul Nokfi** `#1456A2` (marca), azul claro `#3B82F6`, texto azul `#5B9BE6`
  sobre oscuro.
- Fondo oscuro `#0F0F0F` / claro `#FFFFFF`; texto `#0F172A` en claro.
- Tipografía: **Plus Jakarta Sans** (la de la web); números grandes en negrita.
- Logo: la «N» con flecha (`frontend/public/favicon.svg`); foto de perfil =
  N blanca sobre cuadrado azul (`icon-512.png`).
- Capturas: siempre las **reales** de la app con la cuenta de ejemplo
  («Taller García», datos ficticios), y se dice que son de ejemplo.
- Plantillas: `marketing/redes/plantillas/` (ver su README). Producción de vídeos: `marketing/redes/docs/PRODUCCION.md`.

---

## 3. Tono de voz

- **Cercano y concreto**: de tú, frases cortas, un dato o un paso por pieza.
- **Útil antes que vendedor**: 4 de cada 5 piezas enseñan algo sin nombrar la
  app; la quinta enseña una función con captura.
- **Fechas y cifras de fuentes oficiales** (AEAT, BOE, Seguridad Social) y del
  año en curso; si cambian, se dice.
- Emojis con moderación (0-2 por pieza). Sin mayúsculas gritadas.
- Cierre habitual: una pregunta a la comunidad o «calculadora gratis en la bio».
- Hashtags: 3-5, en español y concretos: `#autonomos #autonomosespaña
  #iva #modelo303 #facturas #pymes #finanzas #hacienda`.

---

## 4. Lo que nunca decimos

1. **Nada que parezca asesoramiento fiscal personalizado.** Siempre
   «orientativo», «en general», «consúltalo con tu gestoría si tu caso es
   especial». Nokfi **no sustituye a la gestoría**.
2. **Nada de «ahorra X €»** ni porcentajes de ahorro inventados. Solo cifras
   que salen de la normativa o de un ejemplo explicado paso a paso.
3. Nada de promesas de resultado («evita multas», «paga menos impuestos»).
   Sí: «llega al plazo sabiendo cuánto te toca».
4. No hablar mal de gestorías, de otros programas ni de Hacienda.
5. No dar por hecho datos sin fecha: VERI*FACTU (obligatorio 1-1-2027 para
   sociedades y 1-7-2027 para el resto) y factura electrónica B2B (pendiente de
   la Orden) se citan con la fecha y «según la normativa actual».
6. No pedir datos personales ni facturas por mensaje privado.
7. No usar capturas con datos de clientes reales; solo la cuenta de ejemplo.
8. Nada de política, humor sobre impagos de clientes concretos ni memes que
   ridiculicen a nadie.

---

## 5. Formatos

| Pieza | Formato | Red |
|---|---|---|
| Carrusel (5-7 láminas) | 1080×1350 | Instagram (y como fotos en TikTok) |
| Imagen única | 1080×1080 | Instagram, X |
| Historia / vídeo vertical | 1080×1920 | Instagram Stories/Reels, TikTok |
| Imagen horizontal | 1600×900 | X |
| Cabecera de perfil | 1500×500 | X |

Vídeo corto: 30-45 s, pantalla del móvil grabada + texto en pantalla +
voz o subtítulos; gancho en los 2 primeros segundos.

---

## 6. Respuestas a comentarios y mensajes

- Claude prepara borradores; el usuario los revisa antes de responder.
- Dudas fiscales concretas: respuesta general + «depende de tu caso, consúltalo
  con tu gestoría» + guía pública si existe.
- Quejas o soporte: llevar a `soporte@nokfi.app` (24 h; 4 h en Max).
- Nunca discutir en público; nunca pedir datos por privado.

### Respuestas tipo (borradores; se adaptan a cada caso)

- **Duda general:** «¡Buena pregunta! En general, [respuesta corta]. Lo tienes
  explicado paso a paso en nokfi.app/guias/[guía]. Si tu caso tiene algo
  especial, mejor confírmalo con tu gestoría.»
- **Duda de su caso concreto:** «Depende de varios datos de tu caso (régimen,
  ingresos, gastos…), así que no queremos darte una cifra a ciegas. Tu gestoría
  te lo puede confirmar; como orientación, [guía o calculadora].»
- **«¿Cuánto cuesta?»:** «Hay tres planes y el Mini tiene 14 días de prueba
  gratis, sin permanencia. Los precios están en nokfi.app/pricing.»
- **Problema con la app:** «¡Vaya! Escríbenos a soporte@nokfi.app con lo que
  ves y lo miramos hoy mismo. Gracias por avisar.»
- **Crítica:** «Gracias por decírnoslo. ¿Nos cuentas qué echas en falta? Nos
  ayuda a mejorar.» (Nunca discutir.)
- **Elogio:** «¡Gracias! Nos alegra que te sirva. 🙌»
