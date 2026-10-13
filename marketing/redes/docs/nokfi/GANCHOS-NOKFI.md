# Banco de ganchos de Nokfi

> Aplicación de [`../metodo/02-GANCHOS.md`](../metodo/02-GANCHOS.md); el número de tipo es el
> de su sección 4. Todas las cifras son de la cuenta de ejemplo («Taller García») o de las
> calculadoras, y están en las grabaciones. «Usado en» vacío = libre.
> Última revisión: 2026-10-13.

## Tipos 1 a 7 (los de partida)

| Tipo | Gancho | Pantalla | Usado en |
|---|---|---|---|
| 1 · Resultado primero | Le hago una foto a esta factura y se apunta sola. | Libro | falta grabar el plano |
| 1 · Resultado primero | Este cliente lleva 36 días sin pagarme una factura. | Cobros | x003 |
| 1 · Resultado primero | Valida un NIF español con una sola llamada. | Playground | x008 |
| 1 · Resultado primero | Este flujo de n8n lee tus facturas de Gmail y las apunta en una hoja. | Plantillas | x009 |
| 1 · Resultado primero | Una llamada, y sabes cuánto le toca pagar a tu cliente este trimestre. | Playground | x018 (lote 5) |
| 1 · Resultado + tiempo | Todo lo que ofrece Nokfi en 60 segundos. | Recorrido | **x001** |
| 2 · Experto que explica | Tres números que miro cada lunes. Tardo un minuto. | Inicio | x017 |
| 2 · Experto que explica | Si cobras por horas, este número decide si ganas dinero o lo pierdes. | Calc. precio/hora | x007 |
| 3 · Llevar la contraria | De esta factura, 210 € no son tuyos. | Calc. IVA | x006 |
| 3 · Llevar la contraria | Un sueldo de 1.500 € no te cuesta 1.500 €. | Calc. coste empleado | x010 |
| 3 · Llevar la contraria | El modelo 130 no es un impuesto de más. | Impuestos | x019 (lote 5) |
| 3 · Llevar la contraria | Excel está bien. Hasta que llega el trimestre. | Excel · Impuestos | x016 |
| 4 · Cifra exacta | Casi 6.000 €. Eso le toca pagar a este taller el día 20. | Impuestos | x002 |
| 4 · Cifra exacta | 32 días. Eso tardan de media en pagarle a este taller. | Cobros | x011 |
| 4 · Cifra exacta | 61 sobre 100. Es la nota de este negocio. | Diagnóstico | x020 (lote 5) |
| 5 · Orden directa | Antes de enviar una factura, comprueba el NIF de tu cliente. | Validador de NIF | x013 |
| 5 · Orden directa | Si eres autónomo, guarda este vídeo antes del día 20. | Calendario | |
| 6 · Bucle abierto | ¿Puedes permitirte contratar a alguien? Tu banco no te lo va a decir. | Previsión de caja | x004 |
| 6 · Bucle abierto | Hay un número en tu factura que decide si vale o no. | Validador de NIF | |
| 7 · Pregunta | ¿Cuánto vas a pagar de cuota de autónomos? Depende de lo que ganes. | Calc. cuota | x005 |
| 7 · Pregunta | Facturas 1.000 € a una empresa. ¿Cuánto te llega al banco? | Calc. retención | x012 |
| 7 · Pregunta | Ingresas 4.000 € al mes como autónomo. ¿Cuánto pagas de cuota? | Calc. cuota | x021 (lote 5) |
| 7 · Pregunta | ¿Tú cuánto apartas para Hacienda cada mes? | Impuestos | |

## Tipos 8 a 17 (añadidos el 2026-10-13; libres salvo los marcados)

Buscan las dos sensaciones del método: «esto me afecta» y «quiero ver cómo acaba». Antes de
usar uno, comprobar que **las cifras salen en la grabación** tal como se dicen.

| Tipo | Gancho | Pantalla | Palancas |
|---|---|---|---|
| 8 · Lo que te cuesta | Tiene 6.200 € en el banco. Casi 6.000 no son suyos. | Previsión de caja + Impuestos | pérdida · cifra propia · sorpresa |
| 8 · Lo que te cuesta | Cobras 1.210 €. Si te gastas los 1.210, el día 20 te faltan 210. | Calc. IVA | pérdida · plazo |
| 8 · Lo que te cuesta | Casi 5.000 € suyos están en la cuenta de otros. 3.400, ya vencidos. | Cobros | pérdida · cifra exacta |
| 8 · Lo que te cuesta | Ofreces 1.500 € de sueldo. De tu cuenta salen casi 2.000 cada mes. | Calc. coste empleado | pérdida · sorpresa |
| 9 · La cuenta atrás | Quedan 7 días para el día 20. ¿Sabes ya cuánto te toca? | Calendario · Impuestos | plazo · hueco |
| 9 · La cuenta atrás | El 1 de diciembre este taller se queda sin caja. Lo sabe desde hoy. | Previsión (escenario) | plazo · resultado a la vista |
| 10 · Por situación | Si facturas a empresas, de cada 1.000 € te retienen 150. Mira lo que llega. | Calc. retención | identidad · cifra propia |
| 10 · Por situación | Si vas a darte de alta de autónomo, mira esto antes de firmar. | Calc. cuota | identidad · hueco |
| 10 · Por situación | Si haces integraciones para clientes españoles, esto te quita una tarde. | Playground · n8n | identidad · resultado |
| 11 · El error común | El error del primer año de autónomo: gastarse el IVA. | Calc. IVA · Impuestos | error · pérdida |
| 11 · El error común | Poner el precio por hora a ojo. Así sale el número de verdad. | Calc. precio/hora | error · hueco |
| 11 · El error común | Mirar el banco para saber si puedes contratar. El banco solo enseña hoy. | Previsión de caja | error · hueco |
| 12 · Casi nadie lo mira | Gratis, sin cuenta, y te dice tu cuota de autónomos en 10 segundos. | Calc. cuota | hueco · resultado |
| 12 · Casi nadie lo mira | Cinco calculadoras para autónomos que no piden ni el correo. | Web pública (calculadoras) | hueco · lista |
| 12 · Casi nadie lo mira | Tu asistente de IA puede validar un NIF español. Solo hay que conectarlo. | Tarjeta MCP · Playground | hueco · sorpresa |
| 13 · Por dentro | ¿Cómo se calcula tu cuota de autónomos? 15 tramos, y tú estás en uno. | Calc. cuota | hueco · identidad |
| 13 · Por dentro | ¿De dónde sale lo que pagas en el 130? Es el 20 % de esto. | Impuestos (modelo 130) | hueco · cifra propia |
| 13 · Por dentro | ¿Cómo sabe Nokfi cuánto vas a tener en caja dentro de 90 días? | Previsión de caja | hueco |
| 14 · La escena | Día 19, once de la noche. Buscando facturas en el correo. | Excel → Impuestos | identidad · emoción · plazo |
| 14 · La escena | Día 13 de octubre. Te llega un correo. | Calendario | **usado en x015** |
| 14 · La escena | Mandas la factura. Pasa un mes. No dices nada por no molestar. | Cobros (recordatorios) | identidad · emoción |
| 15 · Regla o lista | 3 fechas de octubre que un autónomo no puede saltarse. | Calendario | lista · plazo |
| 15 · Regla o lista | 4 cosas que mira este diagnóstico antes de ponerte nota. | Diagnóstico | lista · hueco |
| 16 · Por la mitad | ¡453 € al mes! Solo de cuota. | Calc. cuota (4.000 / 800) | sorpresa · cifra propia |
| 16 · Por la mitad | …y por eso 1.000 € facturados son 1.060 en el banco. | Calc. retención | sorpresa · hueco |
| 16 · Por la mitad | 36 días. Y sigue sin pagar. | Cobros | emoción · cifra exacta |
| 17 · La prueba | Le paso los números del taller al diagnóstico. Le pone un 61. | Diagnóstico | hueco · resultado |
| 17 · La prueba | Pruebo a meter un sueldo de 1.800 € en la previsión. Mira diciembre. | Previsión (escenario) | hueco · resultado a la vista |
| 17 · La prueba | El mismo precio, dos facturas distintas. | Calc. IVA | **usado en x014** |
| 5 · Orden directa | Te dan un precio con IVA y necesitas la base. Así se saca. | Calc. IVA (quitar) | **usado en x022** (lote 5) |

Avisos:

- «3 fechas de octubre» y «4 cosas que mira el diagnóstico»: contar en la grabación cuántas
  salen de verdad antes de escribir el número.
- «El error del primer año» es una observación general, no un dato: el vídeo no da porcentajes.
- Los tipos 8 y 11 se cierran siempre enseñando **dónde se ve el dato a tiempo**; nunca
  prometen ahorro.

**Nunca**: «ahorra X €», promesas fiscales, asesoramiento personalizado, funciones que no
existen, la dirección `localhost`, datos de un cliente real, «Hacienda no quiere que sepas
esto», plazos o sanciones inventados, pedir que comenten una palabra.

**Cierres**: «Envíaselo a ese amigo autónomo que va justo el día 20» · «Guárdalo para antes
del día 20» · «Envíaselo a quien odia reclamar facturas» · «Guárdalo para tu próximo
presupuesto» · «Envíaselo a quien está pensando en contratar» · «Envíaselo a ese autónomo que
paga sin saber por qué» · siempre con `nokfi.app` y «14 días gratis» cuando se habla de la app
de pago.
