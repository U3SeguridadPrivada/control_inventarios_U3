import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
const db = new Database(dbPath);

console.log('Sembrando Plantilla Base del Contrato Laboral U3 en:', dbPath);

// Importamos la función de generación con datos por defecto
import('../src/lib/generadorContrato.ts').catch(async () => {
  // En caso de que node directo no soporte ts sin compilar, usamos datos serializados
});

// Verificamos si ya existe el protocolo maestro
const existente = db.prepare(`
  SELECT id, titulo FROM protocolos 
  WHERE titulo LIKE '%Contrato Individual de Trabajo%' OR titulo LIKE '%Contrato Laboral%'
  LIMIT 1
`).get();

const titulo = 'Contrato Individual de Trabajo - Tiempo Indeterminado (Periodo de Prueba)';
const categoria = 'Recursos Humanos';
const descripcion = 'Contrato oficial individual de trabajo por tiempo indeterminado con periodo de capacitación inicial y prueba conforme al artículo 39-A de la Ley Federal del Trabajo. Totalmente editable en hojas oficiales tamaño Carta.';
const prioridad = 'Alta';

// Contenido estructurado base
const contenidoBase = {
  version: '1.0',
  subtitulo: 'TIEMPO INDETERMINADO (PERIODO DE PRUEBA)',
  area: 'Dirección de Recursos Humanos y Jurídico',
  codigo: 'U3-CON-LAB-2026-V1',
  clasificacion: 'Confidencial / Expediente Laboral',
  alcance: 'TÉCNICO EN SEGURIDAD PRIVADA',
  secciones: [
    {
      id: 'sec-proemio',
      tipo: 'capitulo',
      numero: 'PROEMIO',
      titulo: 'CONTRATO INDIVIDUAL DE TRABAJO',
      bloques: [
        {
          tipo: 'subtitulo',
          texto: 'TÉCNICO EN SEGURIDAD PRIVADA · CIUDAD DE MÉXICO'
        },
        {
          tipo: 'parrafo',
          texto: 'En la Ciudad de México, el día 16 de enero del año 2026, los que suscribimos el presente, a saber, <strong>U3 SEGURIDAD PRIVADA, S.A. DE C.V.</strong>, representada en este acto por el <strong>Sr. JUAN CARLOS ULLOA CASTILLEJOS</strong>, a quien en lo sucesivo se le denominará el <strong>PATRÓN</strong> y por la otra parte el <strong>SR. ISRAEL MONROY SAN MARTIN</strong> por su propio derecho, a quien en adelante se le denominará el <strong>TRABAJADOR</strong>, hacemos constar que hemos convenido en celebrar un contrato individual de trabajo, en los términos del artículo 39-A de la Ley Federal del Trabajo, al tenor de las siguientes declaraciones y cláusulas:'
        }
      ]
    },
    {
      id: 'sec-declaraciones',
      tipo: 'capitulo',
      numero: 'DECLARACIONES',
      titulo: 'DECLARACIONES DE LAS PARTES',
      bloques: [
        {
          tipo: 'subtitulo',
          texto: 'I. Declara el PATRÓN, por conducto de su representante:'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>a)</strong> Que se dedica principalmente a la prestación de servicios de seguridad privada; que tiene su domicilio en Avenida Insurgentes Sur No. 1915, despacho 401, Guadalupe Inn, Álvaro Obregón, C.P. 01020, Ciudad Capital, con número de Registro Federal de Contribuyentes <strong>USP 2205057DA</strong>.'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>b)</strong> Que para cumplir con su objeto social, tiene necesidad de contratar los servicios del <strong>TRABAJADOR</strong> para que reciba una <strong>CAPACITACIÓN INICIAL</strong>, a efecto de que se encuentre en posibilidades de desempeñar un trabajo personal y subordinado, como <strong>GUARDIA DE SEGURIDAD PRIVADA</strong>, y poder llevar a cabo las funciones y actividades que se señalan en el presente instrumento.'
        },
        {
          tipo: 'subtitulo',
          texto: 'II. Declara el TRABAJADOR, por su propio derecho:'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>a)</strong> Llamarse <strong>ISRAEL MONROY SAN MARTIN</strong>, ser de <strong>35 AÑOS</strong>, de estado civil <strong>SOLTERO</strong>, de nacionalidad <strong>MEXICANA</strong>, con R.F.C. <strong>MOSI891125H59</strong> y C.U.R.P. <strong>MOSI891125HMCNNS02</strong>.'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>b)</strong> Que tiene su domicilio en la <strong>calle de VIRGEN MARIA #19; COL. VIRGENCITAS; CP 57300 NEZAHUALCOYOTL, ESTADO DE MÉXICO</strong>, mismo que señala para oír y recibir toda clase de notificaciones y documentos.'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>c)</strong> Que reconoce y acepta que a la firma del presente contrato, no cuenta con conocimientos, capacitación, habilidades, certificación, ni la experiencia necesaria o suficiente para el puesto que va a desempeñar, por lo que acepta prestar sus servicios subordinados conforme se establece en las cláusulas del presente contrato por un período inicial de capacitación como <strong>GUARDIA DE SEGURIDAD PRIVADA</strong>, en la inteligencia de que una vez concluido dicho periodo y si demuestra tener aptitudes para el cargo la relación de trabajo continuará por tiempo indeterminado, de lo contrario y conforme a lo señalado en las cláusulas siguientes de este instrumento la relación de trabajo se dará por terminada sin ninguna responsabilidad para el PATRÓN.'
        },
        {
          tipo: 'parrafo',
          texto: '<strong>d)</strong> Que a la celebración del presente contrato no pertenece a ninguna institución, corporación pública o privada dedicada a la seguridad.'
        }
      ]
    },
    {
      id: 'sec-clausulas-generales',
      tipo: 'capitulo',
      numero: 'CLÁUSULAS',
      titulo: 'CONDICIONES DE LA CAPACITACIÓN Y DEL SERVICIO',
      bloques: [
        {
          tipo: 'subtitulo',
          texto: '1. Periodo de Capacitación Inicial y Prueba'
        },
        {
          tipo: 'parrafo',
          texto: 'Ambas partes convienen en que conforme al artículo 39-A de la Ley Federal del Trabajo, el presente contrato tendrá un período de capacitación inicial de <strong>30 días</strong> el cual podrá extenderse hasta <strong>180 (CIENTO OCHENTA) días improrrogables</strong> si así lo determina el PATRÓN, a efecto de que el TRABAJADOR pueda acreditar que ha adquirido los conocimientos y habilidades necesarias para desempeñar el cargo de <strong>GUARDIA DE SEGURIDAD PRIVADA</strong> y por consiguiente que cumple con los requisitos y tiene aptitudes suficientes para el desempeño de las funciones inherentes al cargo. De no acreditar el TRABAJADOR que es competente para desarrollar las labores encomendadas y atento a lo dispuesto por el artículo 39-A de la Ley Federal del Trabajo y previa opinión de la Comisión Mixta de Productividad, Capacitación y Adiestramiento se dará por terminada la relación de trabajo sin responsabilidad para el PATRÓN.'
        },
        {
          tipo: 'subtitulo',
          texto: '2. Compromiso de Competencia'
        },
        {
          tipo: 'parrafo',
          texto: 'Lo antes mencionado en virtud de que el TRABAJADOR ha manifestado que, a la fecha de firma del presente contrato, no cuenta con conocimientos, capacitación, habilidades, certificación, ni la experiencia necesaria o suficiente para el puesto que va a desempeñar; por consiguiente, se compromete a dedicar su mejor esfuerzo para acreditar la competencia.'
        },
        {
          tipo: 'subtitulo',
          texto: '3. Vigencia y Salario durante Capacitación'
        },
        {
          tipo: 'parrafo',
          texto: 'La vigencia del presente contrato de capacitación inicial surtirá efectos a partir de la fecha de firma del presente instrumento, con fecha <strong>16 de enero del año 2026</strong>.<br/><br/>Durante la vigencia del presente contrato y conforme lo establecido por los artículos 39-A, 39-B, 39-C, 39-D y 39-E de la Ley Federal del Trabajo, el TRABAJADOR disfrutará del salario que se estipula en la CLÁUSULA 7 (SIETE) y de las prestaciones de ley.'
        },
        {
          tipo: 'subtitulo',
          texto: '4. Acatamiento Normativo y Reglamento Interior'
        },
        {
          tipo: 'parrafo',
          texto: 'Queda expresamente convenido que el TRABAJADOR acatará en todo momento las disposiciones del <strong>Reglamento Interior de Trabajo</strong>, las órdenes, circulares y disposiciones que dicte el PATRÓN, sus representantes y sus superiores, así como todos los ordenamientos que le sean aplicables de acuerdo a las atribuciones y obligaciones que la capacitación para el puesto le determinen. De igual forma se obliga a respetar las disposiciones de índole normativo y de seguridad tanto del PATRÓN como de los lugares en donde se lleve a cabo la capacitación para el trabajo.'
        },
        {
          tipo: 'subtitulo',
          texto: '5. Funciones, Actividades y Movilidad de Servicio'
        },
        {
          tipo: 'parrafo',
          texto: 'Conforme a lo dispuesto por el artículo 25 de la Ley Federal del Trabajo, de manera enunciativa pero no limitativa el TRABAJADOR deberá llevar a cabo las siguientes actividades: <strong>CAPACITACIÓN INICIAL como GUARDIA DE SEGURIDAD PRIVADA para el resguardo de bienes y control de accesos</strong>. En consecuencia el TRABAJADOR se obliga a realizar las actividades relacionadas a dicha capacitación inicial, prestando siempre sus servicios personales subordinado jurídicamente al PATRÓN, con esmero, eficiencia, ética y honradez y por la naturaleza del trabajo que va a desempeñar así como por la actividad comercial del PATRÓN, el TRABAJADOR se obliga a desempeñar sus actividades en las oficinas, talleres o locales que el PATRÓN le indique ya sean de su propiedad o de terceras personas físicas, morales o instituciones; y cuando el PATRÓN lo estime conveniente podrá reubicarlo o cambiarlo de servicio o lugar de trabajo, en virtud de lo cual el TRABAJADOR en este acto da su expreso consentimiento para desempeñar sus labores en el domicilio que el PATRÓN le indique y a ser cambiado o reubicado cuando sus superiores así lo consideren conveniente y sin previo aviso.'
        },
        {
          tipo: 'subtitulo',
          texto: '6. Exclusividad del Vínculo Laboral'
        },
        {
          tipo: 'parrafo',
          texto: 'En virtud de la naturaleza del trabajo y de las actividades que va a desarrollar el TRABAJADOR y de acuerdo con lo antes mencionado, reconoce expresamente que su <strong>único empleador es el PATRÓN</strong>, para el cual prestará un trabajo personal y subordinado, asimismo como también que no se genera derecho o vínculo laboral con ningún cliente del PATRÓN.'
        }
      ]
    },
    {
      id: 'sec-clausulas-economicas',
      tipo: 'capitulo',
      numero: 'CLÁUSULAS',
      titulo: 'REMUNERACIÓN, JORNADA, DESCANSOS Y CONFIDENCIALIDAD',
      bloques: [
        {
          tipo: 'subtitulo',
          texto: '7. Salario, Forma y Lugar de Pago'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR percibirá, por la prestación de los servicios a que se refiere este contrato, un salario de <strong>$9,451.20</strong> (<strong>NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS 20/100 M.N.</strong>) mensuales, el cual incluye el pago de los días de descanso semanal que contenga el mes, así como el pago de los días de descanso obligatorio cuando los haya, menos deducciones y retenciones que correspondan por ley.<br/><br/>El salario se le pagará proporcionalmente en forma <strong>catorcenal</strong>, en caso de que un día de pago sea día inhábil, la remuneración se pagará el día hábil anterior; estando obligado el TRABAJADOR a firmar las constancias de pago respectivas.<br/><br/>El pago podrá ser en efectivo, cheque, depósito o transferencia electrónica, por lo que el TRABAJADOR en este acto otorga su consentimiento para que el salario y cualquier otra percepción a que tenga derecho sea depositada en una cuenta de institución bancaria, de nómina, de débito, transferencia o cualquier otro medio electrónico que para tal efecto aperture el PATRÓN a nombre del TRABAJADOR, en la inteligencia de que posterior a la entrega de su tarjeta de nómina, será de su única y absoluta responsabilidad cualquier retiro o cargo que aparezca en la misma.<br/><br/>El TRABAJADOR se obliga a descargar de internet e imprimir el Comprobante Fiscal Digital (CFDI), el cual se le podrá proporcionar mediante correo electrónico; dicho CFDI así como el comprobante del depósito que el PATRÓN realice en la cuenta antes mencionada serán considerados como recibo de pago de salario y percepciones a que tenga derecho el TRABAJADOR.<br/><br/>El TRABAJADOR deberá de manera inmediata aclarar las dudas que tenga respecto de los salarios o percepciones que le sean pagados acudiendo al área de Recursos Humanos.'
        },
        {
          tipo: 'subtitulo',
          texto: '8. Jornada Laboral y Horarios'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR acepta que la duración de la jornada laboral será señalada por el PATRÓN de acuerdo a las necesidades del servicio al que sea asignado, laborando <strong>6 (SEIS) días a la semana</strong>. Durante la jornada laboral el TRABAJADOR gozará de un período de descanso para tomar sus alimentos fuera de las instalaciones a la que se encuentre asignado.<br/><br/>En virtud de lo antes mencionado y atendiendo a lo señalado por el artículo 59 de la Ley Federal del Trabajo, el PATRÓN queda facultado por el TRABAJADOR para establecer horarios continuos y discontinuos de acuerdo a las necesidades del servicio al que se encuentre asignado el TRABAJADOR, en la inteligencia que únicamente será considerado tiempo extraordinario el que exceda el límite semanal establecido en la Ley Federal del Trabajo.'
        },
        {
          tipo: 'subtitulo',
          texto: '9. Trabajo Extraordinario'
        },
        {
          tipo: 'parrafo',
          texto: 'Cuando por circunstancias extraordinarias se aumente la jornada de trabajo, los servicios prestados durante el tiempo excedente se considerarán como extraordinarios y se pagarán en la forma establecida por la Ley. Las horas y los días de trabajo extraordinario solo podrán ser señalados por el PATRÓN, mediante previa orden que al respecto se haya dado por escrito.'
        },
        {
          tipo: 'subtitulo',
          texto: '10. Días de Descanso Semanal y Obligatorio'
        },
        {
          tipo: 'parrafo',
          texto: 'Por cada seis días de trabajo el TRABAJADOR tendrá un día de descanso, conviniéndose en que dicho día de descanso lo disfrutará preferentemente el día domingo de cada semana, sin perjuicio de que el PATRÓN modifique dicho día de descanso semanal cuando las necesidades del servicio así lo requieran pagando la prima dominical que marca el artículo 71 de la ley, disfrutando también de los días de descanso obligatorios conforme a lo señalado en el artículo 74 de la Ley Federal del Trabajo.'
        },
        {
          tipo: 'subtitulo',
          texto: '11. Control de Asistencia'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR está obligado a firmar las listas de asistencia o la modalidad que el PATRÓN indique (checador digital, biométrico o bitácora), a la entrada y salida de sus labores, por lo que el incumplimiento de este requisito indicará la falta injustificada a sus labores, para todos los efectos legales.'
        },
        {
          tipo: 'subtitulo',
          texto: '12. Justificación de Ausencias e Incapacidades'
        },
        {
          tipo: 'parrafo',
          texto: 'Cuando el TRABAJADOR falte a sus labores deberá notificar y justificar al PATRÓN de manera inmediata su ausencia con el certificado de incapacidad original que expide el Instituto Mexicano del Seguro Social (IMSS), o cuando solicite permiso para faltar a sus labores deberá solicitar previamente permiso por escrito de su jefe inmediato con el visto bueno del departamento de Recursos Humanos; de lo contrario se considerará cualquier falta como injustificada.'
        },
        {
          tipo: 'subtitulo',
          texto: '13. Vacaciones y Prima Vacacional'
        },
        {
          tipo: 'parrafo',
          texto: 'Conforme lo dispone el artículo 76 de la Ley Federal del Trabajo, el TRABAJADOR tendrá derecho a un período anual de vacaciones pagadas de 12 días para el primer año de servicio y en el caso de que no haya cumplido un año de trabajo, tendrá derecho a que se le paguen vacaciones en proporción al tiempo trabajado.'
        },
        {
          tipo: 'subtitulo',
          texto: '14. Aguinaldo Anual'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR percibirá un aguinaldo anual, que deberá pagársele antes del día veinte de diciembre de cada año, equivalente a quince días de salario. Cuando no haya cumplido el año de servicios, tendrá derecho a que se le pague en proporción al tiempo laborado.'
        },
        {
          tipo: 'subtitulo',
          texto: '15. Material, Uniformes y Equipo de Trabajo'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR reconoce y acepta que son propiedad exclusiva del PATRÓN el material, equipo, herramientas, uniformes, documentos, formatos, así como cualquier otro bien que se le proporcione para el desempeño de sus funciones, comprometiéndose a utilizarlos en forma adecuada y a conservarlos en buen estado, firmando los acuses de recibo que correspondan y comprometiéndose a devolverlos íntegramente cuando le sea requerido o bien al terminar el presente Contrato por el motivo que fuere.'
        },
        {
          tipo: 'subtitulo',
          texto: '16. Propiedad de Documentos e Información'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR reconoce que todos los documentos e información que se le proporcione con motivo de la relación de trabajo, así como los que el propio TRABAJADOR prepare o formule en relación o conexión con su trabajo, son propiedad exclusiva del PATRÓN, por lo que se obliga a conservarlos y entregarlos al PATRÓN en el momento en que éste lo requiera o bien al concluir el presente instrumento.'
        },
        {
          tipo: 'subtitulo',
          texto: '17. Confidencialidad Absoluta y Secreto Profesional'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR se obliga a guardar absoluta confidencialidad sobre cualquier tipo de información, datos y documentos a que tenga acceso en virtud de la relación laboral y a no usarlos en beneficio propio, ni a divulgar por ningún medio o forma, directa o indirectamente, en todo o en parte, cualquiera de los aspectos de los negocios del PATRÓN, ni de sus clientes, agentes, filiales o terceros relacionados con el PATRÓN, salvo que sea autorizado por escrito por el representante legal del PATRÓN.<br/><br/>Si el TRABAJADOR dejare de cumplir con las disposiciones de esta cláusula quedará sujeto a la rescisión justificada del presente contrato y a la responsabilidad civil por daños y perjuicios que causare al PATRÓN, así como a las sanciones penales correspondientes.'
        }
      ]
    },
    {
      id: 'sec-clausulas-beneficiarios-cierre',
      tipo: 'capitulo',
      numero: 'CLÁUSULAS',
      titulo: 'BENEFICIARIOS, ANTIGÜEDAD Y RATIFICACIÓN',
      bloques: [
        {
          tipo: 'subtitulo',
          texto: '18. Designación de Beneficiarios (Art. 501 LFT)'
        },
        {
          tipo: 'parrafo',
          texto: 'Para los efectos del artículo 25 fracción X en relación con el artículo 501 de la Ley Federal del Trabajo, el TRABAJADOR designa como beneficiario(s) para el pago de los salarios y prestaciones devengadas y no cobradas a la muerte o desaparición involuntaria a la siguiente persona:'
        },
        {
          tipo: 'tabla',
          encabezados: ['NOMBRE COMPLETO DEL BENEFICIARIO', 'PORCENTAJE', 'PARENTESCO'],
          filas: [
            ['NANCY SAN MARTIN GONZALEZ', '100%', 'MADRE']
          ]
        },
        {
          tipo: 'subtitulo',
          texto: '19. Reconocimientos Médicos Periódicos'
        },
        {
          tipo: 'parrafo',
          texto: 'El TRABAJADOR conviene en someterse a los reconocimientos médicos y pruebas toxicológicas que periódicamente ordene el PATRÓN, los previstos en el Reglamento Interior de Trabajo, normas oficiales mexicanas vigentes y los que ordenen las autoridades competentes en razón del giro de seguridad privada.'
        },
        {
          tipo: 'subtitulo',
          texto: '20. Capacitación y Adiestramiento Continuo'
        },
        {
          tipo: 'parrafo',
          texto: 'El PATRÓN se compromete a proporcionar la capacitación y el adiestramiento conforme a los planes y programas establecidos o que se aprueben, de acuerdo con lo dispuesto por la Ley Federal del Trabajo y las disposiciones de la Secretaría de Seguridad Ciudadana.'
        },
        {
          tipo: 'subtitulo',
          texto: '21. Fecha de Antigüedad'
        },
        {
          tipo: 'parrafo',
          texto: 'Para efectos de antigüedad, ambas partes reconocen expresamente que el TRABAJADOR comenzó a prestar sus servicios para el PATRÓN <strong>el 16 de enero del año 2026</strong>.'
        },
        {
          tipo: 'subtitulo',
          texto: '22. Legislación Aplicable'
        },
        {
          tipo: 'parrafo',
          texto: 'Ambas partes convienen en que, respecto a las obligaciones y derechos que mutuamente les corresponden y que no hayan sido motivo de cláusula expresa en el presente Contrato, se sujetan estrictamente a las disposiciones del Reglamento Interior de Trabajo de U3 Seguridad Privada y a la Ley Federal del Trabajo.'
        },
        {
          tipo: 'nota',
          texto: 'Leído que fue este contrato por ambas partes, e impuestas de su contenido y fuerza legal lo ratifican y firman por duplicado, quedando un ejemplar en poder de cada una de las partes en la fecha señalada en el proemio del presente instrumento.'
        },
        {
          tipo: 'tabla',
          encabezados: ['POR EL PATRÓN', 'POR EL TRABAJADOR'],
          filas: [
            [
              'REPRESENTANTE LEGAL<br/><br/><br/><br/>________________________________________<br/><strong>SR. JUAN CARLOS ULLOA CASTILLEJOS</strong><br/>U3 SEGURIDAD PRIVADA, S.A. DE C.V.',
              'TRABAJADOR CONFORME<br/><br/><br/><br/>________________________________________<br/><strong>ISRAEL MONROY SAN MARTIN</strong><br/>C.U.R.P.: MOSI891125HMCNNS02'
            ]
          ]
        }
      ]
    }
  ]
};

const jsonStr = JSON.stringify(contenidoBase);

if (existente) {
  console.log(`Ya existe el protocolo con ID ${existente.id} ("${existente.titulo}"). Actualizando contenido...`);
  db.prepare(`
    UPDATE protocolos
    SET titulo = ?, categoria = ?, descripcion = ?, tipo = 'documento', pasos = '[]', contenido = ?, prioridad = ?, actualizado_en = datetime('now')
    WHERE id = ?
  `).run(titulo, categoria, descripcion, jsonStr, prioridad, existente.id);
  console.log(`Protocolo ${existente.id} actualizado correctamente.`);
} else {
  const info = db.prepare(`
    INSERT INTO protocolos (titulo, categoria, descripcion, tipo, pasos, contenido, prioridad, activo, creado_por, actualizado_en, created_at)
    VALUES (?, ?, ?, 'documento', '[]', ?, ?, 1, NULL, datetime('now'), datetime('now'))
  `).run(titulo, categoria, descripcion, jsonStr, prioridad);
  console.log(`Contrato Base sembrado exitosamente con ID: ${info.lastInsertRowid}`);
}
