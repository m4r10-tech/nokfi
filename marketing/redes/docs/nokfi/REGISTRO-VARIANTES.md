# Registro de variantes y resultados

> Una fila por vídeo de la etapa 2. Los mandos A-F son los de
> [`../metodo/05-VARIACION.md`](../metodo/05-VARIACION.md); las cifras se apuntan a los 3 y a
> los 7 días ([`../metodo/10-APRENDIZAJE.md`](../metodo/10-APRENDIZAJE.md)).

| Vídeo | A · Gancho | B · Estructura | C · Apertura | D · Movimiento | E · Velocidad | F · Recurso | Dur. | Publicado | Visual. | Ret. 3 s | % visto | Compart. | Guard. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| x001 Todo Nokfi en 60 s | resultado + tiempo | recorrido | título + producto asomando | lateral con giro | medio | rótulos | 56 s | | | | | | |

## Lotes 1 y 2 (voz cortada y revisada; pendientes de montar en su formato)

Formatos de [`../metodo/12-FORMATOS.md`](../metodo/12-FORMATOS.md). Los ocho se montaron o se
iban a montar como F1 con retoques; Mario vio x002 y pidió variedad real (lección I1).

| Vídeo | Formato | Gancho | Velocidad | Voz |
|---|---|---|---|---|
| x002 Casi 6.000 el día 20 | **F2 La cifra** | cifra exacta | medio | OK · falta retoque de la frase 3 («Finanzas e Impuestos») |
| x003 36 días sin cobrar | **F7 El caso** | resultado primero | medio | OK |
| x004 ¿Puedo contratar? | **F6 Pregunta y respuesta** | bucle abierto | sereno | OK |
| x005 Cuota de autónomos | **F8 Dos casos** | orden directa | medio-vivo | OK (el reconocedor oye «cincuenta» en «sin cuenta»: comprobar de oído) |
| x006 210 € no son tuyos | **F3 El mito** | llevar la contraria | medio | OK |
| x007 Tu precio por hora | **F4 Paso a paso** | experto que explica | sereno | OK |
| x008 NIF en una llamada | **F10 Bajo el capó** | resultado primero | vivo | OK |
| x009 n8n lee Gmail | **F5 Antes / ahora** | resultado primero | medio | OK |

## Lotes 3 y 4 (textos escritos; pendientes de que Mario los lea y los locute)

| Vídeo | Formato | Gancho |
|---|---|---|
| x010-un-sueldo-no-cuesta-1500 | **F3 El mito** | llevar la contraria |
| x011-32-dias-en-cobrar | **F2 La cifra** | cifra exacta |
| x012-cuanto-te-llega-al-banco | **F6 Pregunta y respuesta** | pregunta al espectador |
| x013-comprueba-el-nif | **F4 Paso a paso** | orden directa |
| x014-mismo-precio-dos-facturas | **F8 Dos casos** | cifra exacta |
| x015-el-aviso-del-dia-13 | **F7 El caso** | resultado primero |
| x016-excel-hasta-el-trimestre | **F5 Antes / ahora** | llevar la contraria |
| x017-tres-numeros-cada-lunes | **F9 Lista rápida** | experto que explica |

x017 usará F9, que está construido pero aún no se ha visto en ningún vídeo.

## Formatos construidos en el montador

| Formato | Estado |
|---|---|
| F1 Recorrido | **construido y aprobado** (x001) |
| F2 La cifra | **construido** (escenas `dato` con `tarjeta`, `fichas` y `barra`); usado en x002, **pendiente del visto bueno de Mario** |
| F3 El mito | **construido** (escenas `mito` y `prueba`); usado en x006, **pendiente del visto bueno de Mario** |
| F4 Paso a paso | **construido** (escenas `paso` con `pasos` en el guion y `tarjeta`); usado en x007, **pendiente del visto bueno de Mario** |
| F5 Antes / ahora | **construido** (escenas `partida` con `corte` y `antes`); usado en x009, **pendiente del visto bueno de Mario** |
| F6 Pregunta y respuesta | **construido** (escena `pregunta` con `cuenta` + escenas `prueba` con `pregunta` y `chip`); usado en x004, **pendiente del visto bueno de Mario** |
| F7 El caso | **construido** (escenas `caso` con `dia`, `avisos` y `desenfoque`); usado en x003, **pendiente del visto bueno de Mario** |
| F8 Dos casos | **construido** (escenas `duo` con `casos`, `barras` y `diferencia`); usado en x005, **pendiente del visto bueno de Mario** |
| F9 Lista rápida | **construido** (escenas `lista` con `n`, `total`, `intro` y recorte en `tarjeta`); probado solo en fotogramas con una voz prestada, **sin ningún vídeo todavía** |
| F10 Bajo el capó | **construido** (escenas `codigo` con panel que se escribe, `nota` y `chips`); usado en x008, **pendiente del visto bueno de Mario** |

Orden de construcción: F2 → F8 → F4 → F3 → F6 → F7 → F5 → F10 → F9. Cada formato se enseña
primero en fotogramas fijos y luego en un vídeo, antes de usarlo en más.

## Mandos construidos dentro de F1 (`editor.mjs`)

| Mando | Construido (campo del guion) | Pendiente de construir |
|---|---|---|
| C · Apertura | título + producto asomando (`tipo: "titulo"`) · cifra gigante que cuenta (`"cifra"`) · pregunta con respuestas (`"pregunta"`) · producto ya en acción (escena `"app"` sin título previo) | mensaje o notificación |
| D · Movimiento | lateral con giro · vertical · empuje · corte seco (`transicion`) · subida desde abajo tras una sección | dos teléfonos · recorrido lento dentro del plano |
| E · Velocidad | sereno · medio · vivo (`ritmo`) | — |
| F · Recurso | rótulos · rótulo con contador (`cuenta`) · sección numerada · cierre | gráfico · lista que se marca · antes/después · terminal · chat · calendario (existen en `tarjetas.mjs`, de la etapa 1; hay que pasarlos) |

Probado el 2026-10-12 en fotogramas fijos (cifra, pregunta, empuje, vertical, contador,
velocidades). **Nada de esto se ha visto todavía en un vídeo reproducido**: la primera vez
que se use cada opción, se revisa con más cuidado.

Un guion solo puede pedir lo que esté en la columna «Construido».
