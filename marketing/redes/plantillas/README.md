# Plantillas de imagen para redes (sesión 13)

Genera los PNG de cada publicación a partir de un JSON, con la tipografía, los
colores y las capturas reales de Nokfi. Todo en local; no publica nada.

```bash
# desde la raíz del repo; playwright-core de cualquier node_modules y el Chromium de ~/.cache/ms-playwright
PLAYWRIGHT_CORE=../n8n-nodes-nokfi/node_modules/playwright-core node marketing/redes/plantillas/render.mjs            # todas las piezas
PLAYWRIGHT_CORE=… node marketing/redes/plantillas/render.mjs marketing/redes/piezas/00-identidad.json              # una
```

Salida: `marketing/redes/salida/<id>/<nn>-<plantilla>.png` (no se versiona).

| Formato | Tamaño | Uso |
|---|---|---|
| `cuadrado` | 1080×1080 | Instagram, X |
| `post` | 1080×1350 | carrusel de Instagram / fotos de TikTok |
| `vertical` | 1080×1920 | Stories, Reels, TikTok |
| `horizontal` | 1600×900 | X |
| `cabecera` | 1500×500 | cabecera del perfil de X |

Temas: `oscuro` (por defecto), `claro`, `azul`.

Plantillas: `portada`, `paso` (`numero`), `dato` (`dato` = cifra o fecha grande),
`lista` (`puntos`), `captura` (`captura`, `desde`, `ventana`), `cierre` (`boton`,
`aviso`), `cabecera`, `perfil`. Campos comunes: `etiqueta`, `titulo`, `texto`.
En los textos, `**así**` resalta en azul y `\n` parte la línea.

## Capturas del móvil

`capturas-movil/<pantalla>-dark.jpg`: capturas reales (390 de ancho, página
entera) de la cuenta de ejemplo «Taller García», datos ficticios. Se regeneran
con el frontend compilado:

```bash
cd backend && SHOTS_DATE=2026-09-29 SHOTS_OUT=$(realpath ../marketing/redes/plantillas/capturas-movil) \
  PLAYWRIGHT_CORE=$(realpath ../../n8n-nodes-nokfi/node_modules/playwright-core) node scripts/landing-screens.js
```

`SHOTS_DATE` cae en el 3T para que Impuestos muestre los datos de ejemplo.
Después se borran `configuracion`, `ayuda`, `historial`, `landing` y `precios`.
Ojo: Inicio calcula el plazo y Hacienda con la fecha real del servidor; mejor
usar Impuestos, Cobros, Libro, Informe, Calculadoras o Cuestionario.
