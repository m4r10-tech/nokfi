# Portadas de los vídeos

> Norma para la portada de cada vídeo de TikTok (@nokfi4). Última revisión: 2026-10-12.

## 1. Para qué sirve

La portada no se ve en el «Para ti» (ahí el vídeo arranca solo): se ve en **la rejilla del
perfil**, en el **buscador** y cuando alguien comparte el enlace. Su trabajo es que quien
entra al perfil entienda de un vistazo de qué va cada vídeo y que el perfil entero parezca
de una marca seria.

## 2. Cómo se hace: es un fotograma del propio vídeo

TikTok deja elegir como portada un fotograma del vídeo, y Buffer (modo viaje) solo admite
indicar el milisegundo. Por eso **la portada se diseña dentro del vídeo**:

- Los primeros **0,9 s** del vídeo muestran un fotograma de portada completo: título, imagen
  de la app y marca. Es también lo que frena el dedo, así que hace doble trabajo.
- El montador guarda ese fotograma como `portada.png` junto al vídeo.
- **Al subir a mano**: en TikTok, «Editar portada» → arrastrar al principio del vídeo
  (segundo 0-1). No usar el texto de portada de TikTok: el título ya va en la imagen.
- **En modo viaje**: `viaje.mjs` usa el milisegundo 900; si un vídeo necesita otro, se
  escribe en `portada-ms.txt` dentro de su carpeta.

## 3. Composición

Lienzo 1080×1920. La rejilla del perfil recorta la portada a **3:4 por el centro**: de los
1920 px de alto solo se ven unos 1440 (se pierden ~240 arriba y ~240 abajo).

```
┌────────────────────┐ 0
│   (se recorta)     │
├────────────────────┤ 240   ← empieza lo que se ve en el perfil
│  ETIQUETA DE SERIE │ 300
│                    │
│  TÍTULO EN 2-3     │ 420-820
│  LÍNEAS            │
│                    │
│  ┌──────────────┐  │
│  │ app o cifra  │  │ 880-1560
│  └──────────────┘  │
│        nokfi       │ 1600
├────────────────────┤ 1680  ← termina lo que se ve en el perfil
│   (se recorta)     │
└────────────────────┘ 1920
```

- **Todo lo importante entre 240 y 1680 px de alto** y con **96 px de margen a cada lado**.
- **Título**: 2-5 palabras, 3 líneas como mucho, Jakarta ExtraBold a unos 96-110 px (tiene
  que leerse en una miniatura de 3 cm). Una palabra o cifra destacada en color.
- **Imagen**: la pantalla de la app o la cifra de la que va el vídeo, enmarcada (esquinas
  redondeadas, sombra). Nunca un menú ni una pantalla vacía.
- **Marca**: «nokfi» pequeño abajo, siempre en el mismo sitio.
- **Etiqueta de serie** arriba, pequeña, para que el perfil se lea por columnas:

| Serie | Etiqueta | Color de acento |
|---|---|---|
| Autónomos y negocios | `AUTÓNOMOS` | azul Nokfi `#1456A2` |
| Calculadoras gratis | `CALCULADORA` | verde |
| Desarrolladores (API, MCP, n8n) | `API` | violeta |
| Qué es Nokfi / recorridos | `NOKFI` | azul claro |

## 4. Texto de la portada

- Es el **gancho resumido**, no el título completo: «210 € no son tuyos», «El día 20, sin
  sustos», «Valida un NIF en una llamada», «Todo Nokfi en 60 s».
- La cifra de la portada es la misma que sale en el vídeo y en la app.
- Sin mayúsculas sostenidas en frases enteras, sin emojis, sin signos de exclamación dobles.
- Prohibido lo mismo que en los guiones: «ahorra X €», promesas fiscales, funciones que no
  existen.

## 5. Lista de comprobación

- [ ] Se lee entera en la miniatura del perfil (probar reducida a 270×360).
- [ ] Nada importante en los 240 px de arriba ni en los 240 de abajo.
- [ ] Título de 5 palabras como mucho y una sola idea.
- [ ] Etiqueta y color de la serie correctos.
- [ ] La imagen de la app es nítida, de la cuenta de ejemplo y sin datos reales.
- [ ] Con las tres últimas portadas al lado, se ve que son de la misma casa pero no iguales.
- [ ] `portada.png` guardada junto al vídeo en `salida/PARA-SUBIR/<carpeta>/`.

## 6. Carpeta de entrega de cada vídeo

```
salida/PARA-SUBIR/NNN-tema/
├── video.mp4        el vídeo (la portada son sus primeros 0,9 s)
├── portada.png      el mismo fotograma, por si hace falta suelto
├── texto.txt        texto de la publicación y etiquetas
├── titulo.txt       opcional: título de TikTok
└── portada-ms.txt   opcional: milisegundo de portada si no es el 900
```

Las medidas del recorte (3:4 centrado) son las habituales de la rejilla de TikTok; se
comprueban con el primer vídeo que se suba y, si no cuadran, se corrige este documento.
