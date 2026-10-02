/**
 * Contenido de las páginas públicas en castellano (sesión 12, SEO).
 * Solo es y en: el resto de idiomas no tiene URL propia (ver seo/routes.js).
 *
 * Cada herramienta y guía: title (≤ 65), description (70-160), h1, intro,
 * sections [{ h, ps, list?, table? }] y faq [{ q, a }]. {y} = año.
 * Cifras verificadas el 2026-10-02 (Orden PJC/297/2026, BOE 31-03-2026).
 * `npm run check:seo` comprueba que no falte nada.
 */
export default {
  ui: {
    home: 'Inicio',
    tools: 'Herramientas',
    guides: 'Guías',
    faqTitle: 'Preguntas frecuentes',
    relatedTools: 'Otras herramientas gratis',
    relatedGuides: 'Guías relacionadas',
    useTool: 'Abrir la calculadora',
    readGuide: 'Leer la guía',
    disclaimer: 'Cálculo orientativo para el régimen general (península y Baleares). No sustituye el asesoramiento de un profesional.',
    privacyNote: 'Se calcula en tu navegador: no se envía ni se guarda nada.',
    updated: 'Actualizado en {m}',
    ctaTitle: 'Lleva tus números sin hojas de cálculo',
    ctaText: 'Nokfi lee tus facturas con IA, te dice cuánto apartar para el 303 y el 130, emite facturas con VERI*FACTU y te avisa de cada plazo. Prueba 14 días gratis.',
    ctaButton: 'Probar 14 días gratis',
    ctaSecondary: 'Qué es Nokfi',
    tableBracket: 'Tramo',
    tableNet: 'Rendimiento neto al mes',
    tableBase: 'Base mínima',
    tableQuota: 'Cuota mínima',
    tableUpTo: 'Hasta {v}',
    tableFrom: 'Más de {v}',
    tableConcept: 'Concepto',
    tableRate: 'Empresa',
    nif: {
      label: 'NIF, NIE o CIF',
      placeholder: 'Por ejemplo, 12345678Z',
      check: 'Comprobar',
      valid: 'Es válido',
      invalid: 'No es válido',
      reasonFormat: 'No tiene el formato de un NIF, NIE o CIF español.',
      reasonDigit: 'El formato es correcto, pero la letra o el dígito de control no cuadra: revisa si hay una errata.',
      type: 'Tipo',
      entity: 'Entidad',
      vat: 'NIF-IVA intracomunitario',
      types: { nif: 'NIF / DNI', nie: 'NIE (extranjeros)', cif: 'NIF de persona jurídica (CIF)' },
      person: 'Persona física',
      entities: {
        A: 'Sociedad anónima', B: 'Sociedad de responsabilidad limitada', C: 'Sociedad colectiva', D: 'Sociedad comanditaria',
        E: 'Comunidad de bienes o herencia yacente', F: 'Sociedad cooperativa', G: 'Asociación o fundación', H: 'Comunidad de propietarios',
        J: 'Sociedad civil', N: 'Entidad extranjera', P: 'Corporación local', Q: 'Organismo público', R: 'Congregación o institución religiosa',
        S: 'Órgano de la Administración del Estado o de las comunidades autónomas', U: 'Unión temporal de empresas',
        V: 'Otro tipo de entidad', W: 'Establecimiento permanente de entidad no residente'
      },
      note: 'Comprueba el formato y el dígito de control. No consulta si está dado de alta en Hacienda ni en el censo VIES.'
    },
    calendar: {
      form: 'Forma jurídica',
      all: 'Todos',
      autonomo: 'Autónomo',
      sociedad: 'Sociedad',
      next: 'Próximo plazo',
      inDays: 'en {n} días',
      inDays_one: 'mañana',
      today: 'hoy',
      models: 'Modelos {m}',
      ifApplies: 'Si te aplica',
      otherYear: 'Calendario fiscal {y}',
      kinds: {
        quarterly: 'Declaraciones trimestrales: IVA, IRPF, retenciones y alquileres',
        withholdings: 'Retenciones de trabajadores y profesionales (111) y alquileres (115)',
        vat_annual: 'Resumen anual de IVA (390)',
        withholdings_annual: 'Resúmenes anuales de retenciones (190 y 180)',
        third_parties: 'Operaciones con terceros de más de 3.005,06 € (347)',
        income_tax_annual: 'Declaración de la renta (100)',
        corporate_annual: 'Impuesto sobre Sociedades (200)',
        corporate_installment: 'Pago fraccionado del Impuesto sobre Sociedades (202)'
      }
    }
  },

  guidesIndex: {
    title: 'Guías de impuestos para autónomos y pymes en España',
    description: 'Guías claras sobre el modelo 303, el 130, el IVA a compensar, los gastos deducibles, cómo hacer una factura, VERI*FACTU y cómo reclamar un impago.',
    h1: 'Guías para autónomos y pymes',
    intro: 'Lo que necesitas saber para llevar tus impuestos y tus facturas al día, explicado con ejemplos y sin jerga.'
  },

  tools: {
    autonomo: {
      title: 'Calculadora de cuota de autónomos 2026 por ingresos reales',
      description: 'Calcula gratis tu cuota de autónomos de 2026 según tus rendimientos netos: tramo, base mínima y cuota al mes con la tabla oficial de la Seguridad Social.',
      h1: 'Calculadora de cuota de autónomos 2026',
      intro: 'Desde 2023 los autónomos cotizan según sus rendimientos netos reales. Escribe lo que facturas y lo que gastas al mes y verás en qué tramo estás y cuánto pagarás a la Seguridad Social.',
      sections: [
        { h: 'Cómo se calcula la cuota de autónomos',
          ps: [
            'Primero se calcula el rendimiento neto: tus ingresos menos los gastos deducibles de la actividad, sin IVA. A ese resultado se le resta un 7 % en concepto de gastos genéricos (un 3 % si eres autónomo societario).',
            'Con el rendimiento neto mensual se busca tu tramo en la tabla. Cada tramo tiene una base de cotización mínima, y la cuota es esa base multiplicada por el tipo de cotización, que en 2026 es del 31,50 %: 28,30 % de contingencias comunes, 1,30 % de contingencias profesionales, 0,90 % de cese de actividad, 0,10 % de formación profesional y 0,90 % del Mecanismo de Equidad Intergeneracional (MEI).'
          ] },
        { h: 'Ejemplo',
          ps: [
            'Facturas 2.500 € al mes y tienes 500 € de gastos. Tu rendimiento es de 2.000 €, y tras restar el 7 % quedan 1.860 €. Estás en el tramo 8 (de 1.850,01 a 2.030 €), con una base mínima de 1.209,15 €. Tu cuota mínima es de 380,88 € al mes.'
          ] },
        { h: 'Tabla de tramos de 2026', table: 'autonomo',
          ps: ['Bases mínimas de la Orden PJC/297/2026 (BOE del 31 de marzo de 2026), las mismas que en 2025. La cuota mínima es la base mínima por el 31,50 %. Puedes cotizar por una base más alta, hasta la máxima de tu tramo.'] },
        { h: 'La regularización: por qué al año siguiente puedes pagar o cobrar',
          ps: [
            'Durante el año cotizas según los rendimientos que prevés. Cuando Hacienda tiene los datos de tu declaración de la renta, la Seguridad Social compara: si ganaste más de lo previsto, te reclama la diferencia; si ganaste menos, te devuelve lo que pagaste de más.',
            'Por eso conviene revisar tu tramo cuando cambien tus ingresos. Puedes cambiarlo hasta seis veces al año desde Import@ss.'
          ] },
        { h: 'Tarifa plana de 80 €',
          ps: ['Si te das de alta por primera vez (o no has sido autónomo en los dos años anteriores, tres si ya la disfrutaste), pagas 80 € al mes durante los primeros 12 meses, sin importar tu tramo. Se puede alargar otros 12 meses si tus rendimientos netos del primer año quedan por debajo del salario mínimo.'] }
      ],
      faq: [
        { q: '¿Cuánto paga un autónomo en 2026?', a: 'Depende de sus rendimientos netos. La cuota mínima va de 205,88 € al mes (tramo 1, hasta 670 € de rendimiento) a 607,35 € (tramo 15, más de 6.000 €). Con la tarifa plana se pagan 80 € al mes el primer año.' },
        { q: '¿Qué gastos se restan para calcular el rendimiento neto?', a: 'Los gastos deducibles de tu actividad según las normas del IRPF: material, alquiler del local, suministros, seguros, asesoría, programas… Después se resta un 7 % más de gastos genéricos (3 % si eres autónomo societario).' },
        { q: '¿Puedo cambiar de tramo durante el año?', a: 'Sí, hasta seis veces al año desde el portal Import@ss de la Seguridad Social. El cambio se aplica a partir del primer día del bimestre siguiente.' },
        { q: '¿El resultado de la calculadora es exacto?', a: 'Es la cuota mínima de tu tramo con la tabla oficial de 2026. La cifra definitiva se fija en la regularización, cuando Hacienda comunica tus rendimientos reales del año.' }
      ],
      guides: ['gastos', 'apartar', 'm130']
    },

    iva: {
      title: 'Calculadora de IVA: añadir o quitar el IVA (21, 10 y 4 %)',
      description: 'Calcula el IVA de un importe en segundos: súmalo a una base o quítalo de un precio con IVA incluido. Tipos de España: 21 %, 10 %, 4 % y 0 %.',
      h1: 'Calculadora de IVA',
      intro: 'Suma el IVA a una base imponible o descúbrelo dentro de un precio que ya lo incluye. Elige el tipo y tendrás la base, la cuota y el total al momento.',
      sections: [
        { h: 'Cómo añadir el IVA a un precio',
          ps: ['Multiplica la base por el tipo de IVA y súmalo. Con el 21 %, una base de 1.000 € lleva 210 € de IVA y el total es 1.210 €. Atajo: base × 1,21.'] },
        { h: 'Cómo quitar el IVA de un precio',
          ps: [
            'Divide el total entre 1 más el tipo. Si un precio de 1.210 € incluye el 21 %, la base es 1.210 ÷ 1,21 = 1.000 €, y el IVA, 210 €.',
            'Un error muy común es restar el 21 % al total: 1.210 − 21 % = 955,90 €, que no es la base. El IVA se calcula sobre la base, no sobre el total.'
          ] },
        { h: 'Tipos de IVA en España',
          list: [
            '21 % (general): la mayoría de productos y servicios.',
            '10 % (reducido): hostelería y restauración, transporte de viajeros, obras de renovación en viviendas, algunos alimentos…',
            '4 % (superreducido): pan, leche, huevos, frutas y verduras, libros, medicamentos…',
            'Operaciones exentas (sanidad, enseñanza reglada, seguros…): no llevan IVA.'
          ],
          ps: ['En Canarias no hay IVA sino IGIC (7 % general), y en Ceuta y Melilla, IPSI.'] }
      ],
      faq: [
        { q: '¿Cómo se calcula el IVA de un precio?', a: 'Multiplica la base imponible por el tipo: al 21 %, 100 € × 0,21 = 21 € de IVA, y el total es 121 €.' },
        { q: '¿Cómo quito el IVA de un total?', a: 'Divide el total entre 1,21 (o 1,10 o 1,04 según el tipo). Por ejemplo, 121 € ÷ 1,21 = 100 € de base.' },
        { q: '¿Qué tipo de IVA tengo que poner en mis facturas?', a: 'El 21 % salvo que tu actividad tenga un tipo reducido (10 % o 4 %) o esté exenta. Si dudas, consulta la Ley del IVA o a tu asesor.' },
        { q: '¿Cuánto IVA tengo que pagar a Hacienda?', a: 'El IVA que cobras en tus facturas menos el que pagas en tus gastos de la actividad. Se declara cada trimestre en el modelo 303.' }
      ],
      guides: ['m303', 'compensar', 'factura']
    },

    irpf: {
      title: 'Calculadora de retención de IRPF en facturas (15 % y 7 %)',
      description: 'Calcula cuánto cobrarás de una factura con IVA y retención de IRPF: 15 % general, 7 % para nuevos autónomos y 19 % en alquileres de locales.',
      h1: 'Calculadora de retención de IRPF en una factura',
      intro: 'Si eres profesional y facturas a empresas o a otros autónomos, tu factura lleva retención. Escribe la base y verás el IVA, la retención y el total que vas a cobrar.',
      sections: [
        { h: 'Cómo se calcula el total de una factura con retención',
          ps: ['Total = base + IVA − retención. Con una base de 1.000 €, IVA del 21 % y retención del 15 %: 1.000 + 210 − 150 = 1.060 €. El IVA y la retención se calculan siempre sobre la base, nunca sobre el total.'] },
        { h: 'Qué retención aplicar',
          list: [
            '15 %: tipo general de los profesionales (actividades del IAE de la sección segunda y tercera).',
            '7 %: el año de alta y los dos siguientes, si no fuiste profesional el año anterior. Tienes que comunicárselo a tu cliente.',
            '19 %: alquiler de locales u oficinas.',
            '1 %: algunas actividades empresariales en módulos.',
            'Sin retención: si facturas a particulares o si tu actividad es empresarial (un comercio, un taller…).'
          ] },
        { h: 'La retención no se pierde',
          ps: ['Tu cliente ingresa la retención en Hacienda a tu nombre (con su modelo 111). Es un adelanto de tu IRPF: se resta en la declaración de la renta y en tu modelo 130. Si el 70 % o más de tus ingresos ya llevan retención, no tienes que presentar el 130.'] }
      ],
      faq: [
        { q: '¿Cuándo tengo que poner retención en una factura?', a: 'Cuando eres profesional (por ejemplo, diseñador, abogado o consultor) y facturas a una empresa o a otro autónomo. A particulares no se les aplica.' },
        { q: '¿Quién puede aplicar el 7 %?', a: 'Los profesionales en el año en que empiezan la actividad y en los dos siguientes, siempre que no hayan ejercido una actividad profesional el año anterior.' },
        { q: '¿La retención se calcula con o sin IVA?', a: 'Sin IVA: sobre la base imponible. Con 1.000 € de base y un 15 %, la retención es de 150 €.' },
        { q: '¿Qué hago con las retenciones que me han hecho?', a: 'Se restan de lo que pagas en el modelo 130 y en la renta. Guarda las facturas: Hacienda cruza los datos con el modelo 190 de tus clientes.' }
      ],
      guides: ['m130', 'factura', 'apartar']
    },

    empleado: {
      title: 'Calculadora del coste de un empleado para la empresa 2026',
      description: 'Calcula cuánto cuesta un trabajador a la empresa en 2026: salario bruto más la Seguridad Social a cargo de la empresa (contingencias, desempleo, FOGASA, MEI).',
      h1: 'Calculadora del coste de un empleado',
      intro: 'Un trabajador no cuesta su sueldo bruto: la empresa paga además alrededor de un 32 % en Seguridad Social. Escribe el salario y verás el coste real al año, al mes y por hora.',
      sections: [
        { h: 'Qué paga la empresa a la Seguridad Social en 2026', table: 'empleado',
          ps: ['Porcentajes a cargo de la empresa en el régimen general (Orden PJC/297/2026). El de accidentes de trabajo y enfermedades profesionales (AT/EP) depende de la actividad; 1,5 % es una media.'] },
        { h: 'Ejemplo',
          ps: ['Un salario bruto de 25.000 € al año con contrato indefinido y un AT/EP del 1,5 % suma un 32,15 % de cotizaciones: 8.037,50 €. El coste total para la empresa es de 33.037,50 € al año, unos 2.753 € al mes.'] },
        { h: 'Lo que no incluye',
          ps: ['La base máxima de cotización en 2026 es de 5.101,20 € al mes: por encima de ese sueldo no se cotiza más (salvo la cuota de solidaridad, que no se incluye). Tampoco se tienen en cuenta bonificaciones, pluses, dietas ni lo que fije tu convenio.'] }
      ],
      faq: [
        { q: '¿Cuánto cuesta un empleado a la empresa?', a: 'Aproximadamente su salario bruto más un 31-33 % de Seguridad Social, según el tipo de contrato y el riesgo de la actividad.' },
        { q: '¿Por qué un contrato temporal cuesta más?', a: 'Porque el desempleo a cargo de la empresa es del 6,70 % en los contratos temporales, frente al 5,50 % de los indefinidos.' },
        { q: '¿Qué es el MEI?', a: 'El Mecanismo de Equidad Intergeneracional: una cotización para reforzar las pensiones. En 2026 es del 0,90 %, del que la empresa paga el 0,75 %.' },
        { q: '¿El salario bruto anual incluye las pagas extra?', a: 'Sí: escribe el bruto total del año, con las pagas extra incluidas.' }
      ],
      guides: ['gastos', 'apartar']
    },

    hora: {
      title: 'Calculadora de precio por hora para autónomos y freelance',
      description: 'Calcula qué precio por hora cobrar como autónomo: suma tus gastos fijos, lo que quieres ganar y tu cuota, y divídelo entre las horas que facturas de verdad.',
      h1: 'Calculadora de precio por hora',
      intro: 'Muchos autónomos ponen su tarifa mirando a la competencia y acaban trabajando por menos de lo que cuesta su negocio. Esta calculadora parte de tus costes y del sueldo que quieres tener.',
      sections: [
        { h: 'La fórmula',
          ps: ['Precio por hora = (gastos fijos + lo que quieres ganar + cuota de autónomos) ÷ horas que facturas al mes. Después se añade un margen para imprevistos, meses flojos y vacaciones.'] },
        { h: 'Ejemplo',
          ps: ['Tienes 400 € de gastos fijos, quieres ganar 2.000 € brutos y pagas 300 € de cuota: necesitas 2.700 € al mes. Si facturas 100 horas, tu coste es de 27 € por hora; con un 10 % de margen, 29,70 €. Con el IVA del 21 %, el cliente paga 35,94 €.'] },
        { h: 'Cuenta solo las horas que cobras',
          ps: ['Presupuestos, emails, facturación, desplazamientos y formación también son trabajo, pero no se facturan. Las horas facturables suelen ser entre el 60 y el 70 % de las que trabajas: con 160 horas al mes, unas 100-110.'] }
      ],
      faq: [
        { q: '¿Cuánto debería cobrar por hora como autónomo?', a: 'Lo necesario para cubrir tus gastos, tu cuota y el sueldo que quieres, repartido entre las horas que de verdad facturas. Luego compáralo con el mercado.' },
        { q: '¿El precio por hora lleva IVA?', a: 'El resultado es sin IVA. Si facturas con IVA, súmale el 21 % (o el tipo que te toque) en la factura.' },
        { q: '¿Tengo que incluir los impuestos?', a: 'Lo que quieres ganar es bruto: de ahí saldrá tu IRPF. Si quieres una cifra neta, súbelo para cubrir el impuesto.' }
      ],
      guides: ['apartar', 'gastos', 'factura']
    },

    calendario: {
      title: 'Calendario fiscal {y} para autónomos y pymes: plazos AEAT',
      description: 'Todas las fechas de {y} para presentar el 303, el 130, el 111, el 115, el 390, el 347, la renta y el Impuesto sobre Sociedades, mes a mes.',
      h1: 'Calendario fiscal {y} para autónomos y pymes',
      intro: 'Los plazos de Hacienda de {y} en el régimen general, mes a mes. Si el último día cae en sábado o domingo, ya está movido al lunes.',
      sections: [
        { h: 'Declaraciones trimestrales',
          ps: ['El IVA (303), el pago fraccionado del IRPF (130) y las retenciones (111 y 115) se presentan del 1 al 20 de abril, julio y octubre. Los del cuarto trimestre, en enero: hasta el 20 el 111 y el 115, y hasta el 30 el 303 y el 130.'] },
        { h: 'Declaraciones anuales',
          ps: ['En enero, los resúmenes anuales de IVA (390) y de retenciones (190 y 180). En febrero, el 347 si has tenido operaciones de más de 3.005,06 € con un mismo cliente o proveedor. La renta (100) se presenta hasta el 30 de junio, y el Impuesto sobre Sociedades (200), hasta el 25 de julio para las empresas con el ejercicio igual al año natural.'] },
        { h: 'Antes de que acabe el plazo',
          ps: ['Si domicilias el pago, el plazo termina unos días antes (en los trimestrales, el día 15). Las fechas no tienen en cuenta los festivos: confírmalas en la sede de la AEAT.'] }
      ],
      faq: [
        { q: '¿Cuándo se presenta el modelo 303?', a: 'Del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero el del cuarto trimestre.' },
        { q: '¿Qué pasa si presento fuera de plazo?', a: 'Si lo haces antes de que Hacienda te lo reclame, pagas un recargo del 1 % más un 1 % por cada mes de retraso. Si te lo reclaman, la sanción es mayor.' },
        { q: '¿Las sociedades presentan el 130?', a: 'No. El 130 es solo para autónomos en estimación directa. Las sociedades hacen pagos fraccionados del Impuesto sobre Sociedades con el modelo 202.' },
        { q: '¿Qué modelos tengo que presentar como autónomo?', a: 'Casi todos los autónomos presentan el 303 y el 130 cada trimestre, el 390 en enero y la renta. El 111, el 115, el 190, el 180 y el 347 solo si tienes trabajadores o profesionales con retención, alquilas un local o superas el límite del 347.' }
      ],
      guides: ['m303', 'm130', 'apartar']
    },

    nif: {
      title: 'Validar NIF, NIE y CIF online: comprobar la letra de control',
      description: 'Comprueba gratis si un NIF, NIE o CIF español es válido: revisa la letra o el dígito de control y te dice el tipo de entidad. Sin registro.',
      h1: 'Validador de NIF, NIE y CIF',
      intro: 'Antes de emitir una factura, comprueba que el NIF de tu cliente está bien escrito. Un NIF erróneo puede hacer que tu factura no sea válida para deducir el IVA.',
      sections: [
        { h: 'Cómo se calcula la letra del DNI',
          ps: ['Se divide el número entre 23 y el resto indica la letra en la serie TRWAGMYFPDXBNJZSQVHLCKE. Por ejemplo, 12345678 entre 23 da resto 14, que corresponde a la Z: 12345678Z.'] },
        { h: 'NIE y CIF',
          ps: [
            'El NIE de los extranjeros empieza por X, Y o Z, que se sustituyen por 0, 1 y 2 para calcular la letra como en el DNI.',
            'El NIF de las empresas (el antiguo CIF) empieza por una letra que indica el tipo de entidad (B para las SL, A para las SA…), sigue con siete dígitos y termina con un dígito o una letra de control.'
          ] },
        { h: 'Lo que no comprueba',
          ps: ['Que el NIF sea correcto no quiere decir que exista o que esté dado de alta. Para operaciones dentro de la UE, comprueba el NIF-IVA en el censo VIES de la Comisión Europea.'] }
      ],
      faq: [
        { q: '¿Cómo sé si un NIF es válido?', a: 'Escríbelo en el validador: comprueba que el formato es correcto y que la letra o el dígito de control cuadran con el resto del número.' },
        { q: '¿El CIF sigue existiendo?', a: 'Desde 2008 se llama NIF, también para las empresas, pero el formato es el mismo y mucha gente sigue llamándolo CIF.' },
        { q: '¿Cuál es el NIF-IVA de una empresa española?', a: 'Su NIF con el prefijo ES (por ejemplo, ESB12345674). Para usarlo en operaciones dentro de la UE tiene que estar dado de alta en el registro de operadores intracomunitarios (ROI).' }
      ],
      guides: ['factura', 'verifactu']
    }
  },

  guides: {
    m303: {
      title: 'Modelo 303: qué es, cómo se calcula y plazos',
      description: 'Qué es el modelo 303 de IVA, quién lo presenta, cómo se calcula el resultado con un ejemplo y cuándo se presenta cada trimestre.',
      h1: 'Modelo 303: la declaración trimestral del IVA',
      intro: 'El modelo 303 es la declaración en la que autónomos y empresas liquidan cada trimestre el IVA de sus facturas. Te explicamos cómo funciona y cómo saber cuánto vas a pagar.',
      sections: [
        { h: 'Quién lo presenta',
          ps: ['Todos los autónomos y sociedades que hacen operaciones con IVA, aunque en el trimestre no hayan facturado nada (en ese caso, se presenta sin actividad). Quedan fuera las actividades exentas, como la sanidad o la enseñanza reglada, y los que están en el recargo de equivalencia.'] },
        { h: 'Cómo se calcula',
          ps: [
            'Resultado = IVA repercutido (el que cobras en tus facturas) − IVA soportado (el que pagas en tus gastos de la actividad).',
            'Ejemplo: en el trimestre facturas 10.000 € de base con el 21 % (2.100 € de IVA) y tienes 3.000 € de gastos con IVA del 21 % (630 €). Pagas 2.100 − 630 = 1.470 €.'
          ] },
        { h: 'Si sale a compensar o a devolver',
          ps: ['Si has pagado más IVA del que has cobrado, el resultado es negativo: lo compensas en los trimestres siguientes y, en el último del año, puedes pedir que te lo devuelvan.'] },
        { h: 'Plazos',
          ps: ['Primer trimestre: del 1 al 20 de abril. Segundo: del 1 al 20 de julio. Tercero: del 1 al 20 de octubre. Cuarto: del 1 al 30 de enero del año siguiente, junto con el resumen anual (390).'] },
        { h: 'Errores habituales',
          list: [
            'Deducir el IVA de un gasto sin factura completa (un tique no basta, salvo factura simplificada con tu NIF).',
            'Deducir gastos personales o de uso mixto sin justificar.',
            'Gastar el IVA cobrado: no es tuyo, solo lo guardas para Hacienda.'
          ] }
      ],
      faq: [
        { q: '¿Tengo que presentar el 303 si no he facturado nada?', a: 'Sí, mientras estés dado de alta en una actividad con IVA. Se presenta con resultado cero o con el IVA de los gastos a compensar.' },
        { q: '¿Qué IVA puedo deducir?', a: 'El de los gastos necesarios para tu actividad, con factura a tu nombre y anotados en tu libro de facturas recibidas.' },
        { q: '¿Puedo domiciliar el pago?', a: 'Sí, si presentas la declaración antes del día 15 del mes de plazo (el 25 de enero en el cuarto trimestre).' }
      ],
      tool: 'iva', guides: ['compensar', 'apartar', 'm130']
    },

    m130: {
      title: 'Modelo 130: el pago fraccionado del IRPF de autónomos',
      description: 'Cómo se calcula el modelo 130 (el 20 % de tu rendimiento neto del año), quién está obligado, cuándo no hay que presentarlo y en qué plazos.',
      h1: 'Modelo 130: pago fraccionado del IRPF',
      intro: 'Con el modelo 130 los autónomos adelantan cada trimestre parte de su IRPF. Así, en la renta, ya han pagado buena parte del impuesto.',
      sections: [
        { h: 'Quién lo presenta',
          ps: ['Los autónomos en estimación directa (normal o simplificada). No están obligados si, el año anterior, al menos el 70 % de sus ingresos de la actividad llevaron retención en factura. Las sociedades no lo presentan.'] },
        { h: 'Cómo se calcula',
          ps: [
            'Es acumulativo: se toma el rendimiento neto desde el 1 de enero hasta el final del trimestre (ingresos menos gastos deducibles), se calcula el 20 % y se restan los pagos de los trimestres anteriores y las retenciones que te han practicado.',
            'Ejemplo: hasta junio has ingresado 20.000 € y gastado 6.000 €: rendimiento de 14.000 €, el 20 % son 2.800 €. Si en el primer trimestre pagaste 1.200 € y te han retenido 300 €, ahora pagas 2.800 − 1.200 − 300 = 1.300 €.'
          ] },
        { h: 'Si sale negativo',
          ps: ['Si los gastos superan a los ingresos, el resultado es cero (no se devuelve). Lo pagado de más se recupera en la declaración de la renta.'] },
        { h: 'Plazos',
          ps: ['Igual que el 303: del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero el del cuarto trimestre.'] }
      ],
      faq: [
        { q: '¿Qué porcentaje se paga en el modelo 130?', a: 'El 20 % del rendimiento neto acumulado del año, menos lo ya pagado en trimestres anteriores y las retenciones.' },
        { q: '¿Tengo que presentar el 130 si facturo con retención?', a: 'No, si el año anterior al menos el 70 % de tus ingresos llevaron retención. Si empiezas este año, se mira el año en curso.' },
        { q: '¿El 130 es un impuesto extra?', a: 'No. Es un adelanto del IRPF: en la renta se resta todo lo que has pagado en el año.' }
      ],
      tool: 'irpf', guides: ['m303', 'apartar', 'gastos']
    },

    apartar: {
      title: 'Cuánto dinero apartar para Hacienda si eres autónomo',
      description: 'Qué parte de cada factura no es tuya: el IVA, el adelanto del IRPF y tu cuota. Cómo calcular cuánto apartar cada mes para no llevarte sustos.',
      h1: 'Cuánto apartar para impuestos',
      intro: 'El dinero que entra en tu cuenta no es todo tuyo. Si apartas cada mes lo que le toca a Hacienda, el trimestre no te pilla sin caja.',
      sections: [
        { h: 'El IVA, entero',
          ps: ['El IVA que cobras en tus facturas es de Hacienda. Aparta el IVA cobrado menos el IVA de tus gastos: es lo que pagarás en el 303.'] },
        { h: 'El IRPF: un 20 % del beneficio',
          ps: ['Si presentas el 130, aparta el 20 % de tus ingresos menos gastos. Si facturas con retención, tu cliente ya lo adelanta por ti. Además, según lo que ganes al año, en la renta puede salir algo más a pagar: si tu beneficio es alto, aparta entre un 25 y un 30 %.'] },
        { h: 'Ejemplo',
          ps: ['Facturas 3.000 € + 630 € de IVA al mes y tienes 800 € de gastos con 168 € de IVA. Aparta 462 € de IVA (630 − 168) y 440 € de IRPF (20 % de 2.200 €): 902 € al mes, sin contar tu cuota de autónomos, que se cobra cada mes.'] },
        { h: 'Un truco que funciona',
          ps: ['Abre una cuenta solo para impuestos y pasa ahí el dinero cada vez que cobres una factura. Lo que queda en tu cuenta principal es lo que puedes gastar.'] }
      ],
      faq: [
        { q: '¿Qué porcentaje de lo que facturo debo apartar?', a: 'Todo el IVA cobrado menos el soportado, y entre un 20 y un 30 % del beneficio para el IRPF, según cuánto ganes.' },
        { q: '¿La cuota de autónomos también?', a: 'Se cobra cada mes por domiciliación, así que no hace falta apartarla para el trimestre, pero sí tenerla en cuenta en tus gastos.' },
        { q: '¿Qué pasa si no aparto nada?', a: 'Que en abril, julio, octubre y enero tendrás que pagar de golpe el IVA y el IRPF del trimestre. Si no tienes el dinero, puedes pedir un aplazamiento a Hacienda, pero con intereses.' }
      ],
      tool: 'iva', guides: ['m303', 'm130', 'gastos']
    },

    compensar: {
      title: 'IVA a compensar: qué es y cómo recuperarlo',
      description: 'Qué significa que tu modelo 303 salga a compensar, cuánto tiempo tienes para usar ese IVA y cuándo puedes pedir que Hacienda te lo devuelva.',
      h1: 'IVA a compensar',
      intro: 'Cuando en un trimestre has pagado más IVA en tus gastos del que has cobrado en tus facturas, Hacienda no te lo devuelve en ese momento: lo guardas para los trimestres siguientes.',
      sections: [
        { h: 'Cuándo pasa',
          ps: ['Es habitual al empezar una actividad (compras equipos y aún facturas poco), en temporadas bajas o cuando haces una inversión grande.'] },
        { h: 'Cómo se usa',
          ps: [
            'En el siguiente 303 se resta del resultado. Ejemplo: en el primer trimestre te salen 400 € a compensar y en el segundo tendrías que pagar 1.000 €: pagas solo 600 €.',
            'Tienes cuatro años para compensarlo. Si en el último trimestre del año sigue habiendo saldo, puedes elegir seguir compensando o pedir la devolución.'
          ] },
        { h: 'La devolución',
          ps: ['Se pide en el 303 del cuarto trimestre. Hacienda tiene seis meses para pagarla; si tarda más, te debe intereses. Si quieres cobrarla cada mes, puedes apuntarte al registro de devolución mensual (REDEME), pero entonces presentas el IVA cada mes.'] }
      ],
      faq: [
        { q: '¿Cuánto tiempo tengo para compensar el IVA?', a: 'Cuatro años desde la declaración en la que se generó.' },
        { q: '¿Puedo pedir la devolución en cualquier trimestre?', a: 'No, solo en el último del año (salvo que estés en el REDEME).' },
        { q: '¿Qué pasa con el IVA a compensar si me doy de baja?', a: 'En la última declaración puedes pedir la devolución del saldo pendiente.' }
      ],
      tool: 'iva', guides: ['m303', 'apartar']
    },

    gastos: {
      title: 'Gastos deducibles de autónomos: lista y requisitos',
      description: 'Qué gastos puede deducirse un autónomo en el IRPF y en el IVA, qué requisitos tienen que cumplir y los casos con letra pequeña: casa, coche y comidas.',
      h1: 'Gastos deducibles de los autónomos',
      intro: 'Cada gasto deducible baja lo que pagas de IRPF y, si lleva IVA, también lo que pagas en el 303. Pero tiene que cumplir unas reglas.',
      sections: [
        { h: 'Los tres requisitos',
          list: [
            'Estar relacionado con tu actividad (afectado a ella).',
            'Tener factura completa a tu nombre y con tu NIF.',
            'Estar anotado en tu libro de gastos.'
          ] },
        { h: 'Gastos que casi siempre se deducen',
          list: [
            'Alquiler del local, suministros del local y seguros de la actividad.',
            'Material, mercancía, herramientas y programas.',
            'Asesoría, gestoría, comisiones bancarias y publicidad.',
            'La cuota de autónomos y el seguro de salud (hasta 500 € al año por persona en el IRPF).',
            'Equipos como ordenadores o maquinaria, a través de la amortización.'
          ] },
        { h: 'Los casos con letra pequeña',
          ps: [
            'Trabajar desde casa: si declaras a Hacienda la parte de la vivienda que usas, deduces esa parte del IBI, la comunidad o el alquiler, y el 30 % de esa proporción de los suministros (luz, agua, internet).',
            'Coche: en el IRPF solo si lo usas exclusivamente para trabajar (salvo comerciales, taxistas, autoescuelas…). En el IVA, Hacienda suele aceptar el 50 %.',
            'Comidas: hasta 26,67 € al día en España (53,34 € si duermes fuera) y 48,08 € en el extranjero (91,35 €), pagadas con tarjeta en un restaurante y en un día de trabajo.'
          ] },
        { h: 'Gastos de difícil justificación',
          ps: ['En estimación directa simplificada, además, restas un 5 % del rendimiento neto en concepto de gastos difíciles de justificar, con un máximo de 2.000 € al año.'] }
      ],
      faq: [
        { q: '¿Puedo deducir un gasto con un tique?', a: 'Para el IVA necesitas factura (completa, o simplificada con tu NIF). Para el IRPF un tique puede servir si demuestra el gasto, pero la factura es mucho más segura.' },
        { q: '¿Puedo deducir el móvil y el ordenador?', a: 'Sí, si los usas para tu actividad. Si también los usas para cosas personales, deduce solo la parte profesional.' },
        { q: '¿Cuánto tiempo guardo las facturas?', a: 'Al menos cuatro años, que es el plazo que tiene Hacienda para revisarlas; seis si llevas contabilidad mercantil.' }
      ],
      tool: 'autonomo', guides: ['apartar', 'm130', 'factura']
    },

    factura: {
      title: 'Cómo hacer una factura: datos obligatorios en España',
      description: 'Qué datos tiene que llevar una factura en España para ser válida, cuándo vale una factura simplificada y cómo corregir una factura con una rectificativa.',
      h1: 'Cómo hacer una factura correctamente',
      intro: 'Una factura con un dato que falta puede impedir que tu cliente deduzca el IVA, y es motivo de sanción. Estos son los datos obligatorios.',
      sections: [
        { h: 'Datos obligatorios de una factura completa',
          list: [
            'Número y, si usas varias, serie. Tienen que ser correlativos.',
            'Fecha de emisión (y la de la operación, si es distinta).',
            'Nombre o razón social, NIF y domicilio del emisor y del cliente.',
            'Descripción de lo que vendes o del servicio.',
            'Base imponible, tipo de IVA y cuota de IVA.',
            'Retención de IRPF, si se aplica, y el total.',
            'Si no lleva IVA, la mención de la exención o de la inversión del sujeto pasivo.'
          ] },
        { h: 'Factura simplificada',
          ps: ['Sustituye al tique: vale para importes de hasta 400 € con IVA (3.000 € en comercio minorista, hostelería y algunos sectores más). Lleva menos datos: número, fecha, tu NIF, el tipo de IVA aplicado o la mención «IVA incluido», y el total.'] },
        { h: 'Cómo corregir una factura',
          ps: ['Una factura emitida no se borra ni se modifica: se hace una factura rectificativa, con su propia serie, que indica qué factura corrige y por qué.'] },
        { h: 'Lo que llega: VERI*FACTU y factura electrónica',
          ps: ['Desde 2027, los programas de facturación tendrán que generar un registro de cada factura y poner un código QR que Hacienda puede comprobar. Más adelante, las facturas entre empresas tendrán que ser electrónicas.'] }
      ],
      faq: [
        { q: '¿Puedo hacer facturas en Word o Excel?', a: 'Hoy sí. Desde 2027 (sociedades) y julio de 2027 (resto), si usas un programa de facturación, este tendrá que cumplir VERI*FACTU.' },
        { q: '¿Qué numeración debo usar?', a: 'Una correlativa, sin saltos. Puedes usar series distintas (por ejemplo, una por año o una para las rectificativas).' },
        { q: '¿Cuánto tiempo tengo para emitir una factura?', a: 'Si el cliente es una empresa o un autónomo, antes del día 16 del mes siguiente a la operación. Si es un particular, en el momento.' }
      ],
      tool: 'nif', guides: ['verifactu', 'm303', 'reclamar']
    },

    verifactu: {
      title: 'VERI*FACTU y factura electrónica: qué cambia y cuándo',
      description: 'Qué es VERI*FACTU, desde cuándo es obligatorio para sociedades y autónomos, y cuándo llega la factura electrónica obligatoria entre empresas.',
      h1: 'VERI*FACTU y factura electrónica',
      intro: 'Son dos normas distintas que suelen confundirse: una afecta a los programas con los que facturas y la otra al formato de las facturas entre empresas.',
      sections: [
        { h: 'VERI*FACTU: los programas de facturación',
          ps: [
            'El Real Decreto 1007/2023 obliga a los programas de facturación a generar un registro de cada factura, encadenado con el anterior para que no se pueda alterar, y a imprimir en la factura un código QR que el cliente puede cotejar en la web de la AEAT.',
            'Es obligatorio desde el 1 de enero de 2027 para las sociedades y desde el 1 de julio de 2027 para el resto, incluidos los autónomos (fechas del Real Decreto-ley 15/2025). Si facturas a mano o con Word y Excel, no te afecta.'
          ] },
        { h: 'Las dos modalidades',
          ps: ['En la modalidad VERI*FACTU, el programa envía cada registro a Hacienda en el momento. En la otra, los registros se firman y se guardan, y se entregan si Hacienda los pide.'] },
        { h: 'La factura electrónica entre empresas',
          ps: ['La Ley Crea y Crece y el Real Decreto 238/2026 obligarán a facturar en formato electrónico estructurado a otras empresas y autónomos, informando de si la factura se acepta y de cuándo se paga. Las fechas previstas son el 1 de octubre de 2027 para las empresas que facturan más de 8 millones de euros y el 1 de octubre de 2028 para el resto (un año y dos años después de la orden ministerial, que aún está en proyecto).'] },
        { h: 'Cómo lo hace Nokfi',
          ps: ['Nokfi emite facturas con su registro encadenado y su código QR, y exporta facturas electrónicas en UBL, Facturae y Factur-X. El envío automático a la AEAT se activará antes de que sea obligatorio.'] }
      ],
      faq: [
        { q: '¿Desde cuándo es obligatorio VERI*FACTU?', a: 'Para las sociedades, desde el 1 de enero de 2027; para los autónomos y el resto, desde el 1 de julio de 2027.' },
        { q: '¿Tengo que enviar mis facturas a Hacienda?', a: 'Solo si tu programa trabaja en la modalidad VERI*FACTU, y lo hace él solo. En la otra modalidad, los registros se guardan firmados.' },
        { q: '¿La factura en PDF es una factura electrónica?', a: 'Para la nueva obligación entre empresas, no: tendrá que ser un formato estructurado (UBL, Facturae, CII…) que un programa pueda leer.' }
      ],
      tool: 'nif', guides: ['factura', 'reclamar']
    },

    reclamar: {
      title: 'Cómo reclamar una factura impagada paso a paso',
      description: 'Qué hacer cuando un cliente no paga: recordatorio, requerimiento formal, intereses de demora y procedimiento monitorio, con plazos y ejemplos de mensaje.',
      h1: 'Cómo reclamar una factura impagada',
      intro: 'La mayoría de los impagos se resuelven con un buen recordatorio a tiempo. Si no, hay pasos claros antes de llegar a un juzgado.',
      sections: [
        { h: '1. Un recordatorio amable',
          ps: ['Al día siguiente del vencimiento, un email breve con el número de factura, el importe y la fecha, y la factura adjunta. Muchas veces es un despiste.'] },
        { h: '2. Un segundo aviso, más firme',
          ps: ['Si en una semana no hay respuesta, llama o escribe de nuevo pidiendo una fecha de pago concreta. Ofrecer un pago fraccionado puede desbloquear la situación.'] },
        { h: '3. Requerimiento formal',
          ps: ['Por burofax o un medio que deje constancia: reclamas la deuda, das un plazo y avisas de que reclamarás los intereses y acudirás a los tribunales. Entre empresas, la Ley 3/2004 fija un plazo máximo de pago de 60 días y permite reclamar intereses de demora (el tipo del BCE más 8 puntos) y 40 € por los costes de cobro.'] },
        { h: '4. Procedimiento monitorio',
          ps: ['Es un procedimiento judicial rápido para deudas documentadas, sin límite de importe. Hasta 2.000 € no necesitas abogado ni procurador: se presenta un formulario en el juzgado del domicilio del deudor.'] },
        { h: 'Y el IVA que ya pagaste',
          ps: ['Si declaraste el IVA de una factura que no cobras, en ciertos casos puedes recuperarlo modificando la base imponible (crédito incobrable). Hay plazos y requisitos: consúltalo con tu asesor.'] }
      ],
      faq: [
        { q: '¿Cuánto tiempo tengo para reclamar una factura?', a: 'Para la mayoría de las deudas, cinco años (artículo 1964 del Código Civil), aunque hay excepciones. Cuanto antes reclames, mejor.' },
        { q: '¿Puedo cobrar intereses por el retraso?', a: 'Entre empresas, sí: la Ley 3/2004 permite reclamar intereses de demora y una indemnización de 40 € por factura.' },
        { q: '¿Necesito abogado para el monitorio?', a: 'No si la deuda es de hasta 2.000 €. Por encima, sí necesitas abogado y procurador.' }
      ],
      tool: 'nif', guides: ['factura', 'apartar']
    }
  }
};
