# Banco de ganchos de Nokfi

> Aplicación de [`../metodo/02-GANCHOS.md`](../metodo/02-GANCHOS.md). Todas las cifras son
> de la cuenta de ejemplo («Taller García») y están en las grabaciones. Se tacha lo usado.

| Tipo | Gancho | Pantalla | Usado en |
|---|---|---|---|
| Resultado primero | Le hago una foto a esta factura y se apunta sola. | Libro | |
| Resultado primero | Este cliente lleva 36 días sin pagarme una factura. | Cobros | x003 (texto) |
| Resultado primero | Valida un NIF español con una sola llamada. | Playground | x008 (texto) |
| Resultado primero | Este flujo de n8n lee tus facturas de Gmail y las apunta en una hoja. | Plantillas | x009 (texto) |
| Resultado primero + tiempo | Todo lo que ofrece Nokfi en 60 segundos. | Recorrido | **x001** |
| Experto que explica | Llevo las cuentas de un taller. Estas tres cifras las miro cada lunes. | Inicio | |
| Experto que explica | Si cobras por horas, este número decide si ganas dinero o lo pierdes. | Calc. precio/hora | x007 (texto) |
| Llevar la contraria | De esta factura, 210 € no son tuyos. | Calc. IVA | x006 (texto) |
| Llevar la contraria | Un sueldo de 1.500 € no te cuesta 1.500 €. | Calc. coste empleado | |
| Llevar la contraria | El modelo 130 no es un impuesto de más. | Impuestos | |
| Cifra exacta | Casi 6.000 €. Eso le toca pagar a este taller el día 20. | Impuestos | x002 (texto) |
| Cifra exacta | 32 días: lo que tardan en pagarte de media. | Cobros | |
| Cifra exacta | 61 sobre 100: la nota de mi negocio. | Diagnóstico | |
| Orden directa | Si eres autónomo, guarda este vídeo antes del día 20. | Calendario | |
| Orden directa | ¿Cuánto vas a pagar de cuota de autónomos? Depende de lo que ganes. | Calc. cuota | x005 (texto) |
| Bucle abierto | ¿Puedes permitirte contratar a alguien? Tu banco no te lo va a decir. | Previsión de caja | x004 (texto) |
| Bucle abierto | Hay un número en tu factura que decide si vale o no. | Validador de NIF | |
| Pregunta al espectador | ¿Tú cuánto apartas para Hacienda cada mes? | Impuestos | |

**Nunca**: «ahorra X €», promesas fiscales, asesoramiento personalizado, funciones que no
existen, la dirección `localhost`, datos de un cliente real.

**Cierres**: «Envíaselo a ese amigo autónomo que va justo el día 20» · «Guárdalo para antes
del día 20» · «Envíaselo a quien odia reclamar facturas» · «Guárdalo para tu próximo
presupuesto» · siempre con `nokfi.app` y «14 días gratis» cuando se habla de la app de pago.
