import { ContenidoDoc } from '@/src/lib/documentoProtocolo';

export interface DatosContrato {
  // Encabezado y Proemio
  puesto: string;
  ciudad: string;
  fechaContrato: string; // ej. '16 de enero del año 2026'
  representantePatronal: string;
  razonSocialPatronal: string;
  rfcPatronal: string;
  domicilioPatronal: string;

  // Trabajador
  nombreTrabajador: string;
  edad: string;
  estadoCivil: string;
  nacionalidad: string;
  rfcTrabajador: string;
  curpTrabajador: string;
  domicilioTrabajador: string;

  diasLaboralesSemana?: number;
  diasPruebaInicial: number;
  diasPruebaMaximo: number;
  fechaInicioVigencia: string;
  salarioMensualNumero: number;
  salarioMensualLetra?: string;
  periodicidadPago: string; // 'catorcenal' | 'quincenal' | 'mensual' | 'semanal'
  fechaInicioAntiguedad: string;

  // Beneficiario Art. 501 LFT
  beneficiarioNombre: string;
  beneficiarioPorcentaje: string;
  beneficiarioParentesco: string;
}

const UNIDADES = ['', 'un ', 'dos ', 'tres ', 'cuatro ', 'cinco ', 'seis ', 'siete ', 'ocho ', 'nueve '];
const DECENAS_10_19 = [
  'diez ', 'once ', 'doce ', 'trece ', 'catorce ', 'quince ',
  'dieciséis ', 'diecisiete ', 'dieciocho ', 'diecinueve '
];
const DECENAS = [
  '', '', 'veinte ', 'treinta ', 'cuarenta ', 'cincuenta ',
  'sesenta ', 'setenta ', 'ochenta ', 'noventa '
];
const CENTENAS = [
  '', 'ciento ', 'doscientos ', 'trescientos ', 'cuatrocientos ', 'quinientos ',
  'seiscientos ', 'setecientos ', 'ochocientos ', 'novecientos '
];

function convertirCentenas(num: number): string {
  if (num === 100) return 'cien ';
  const c = Math.floor(num / 100);
  const d = Math.floor((num % 100) / 10);
  const u = num % 10;

  let texto = CENTENAS[c];

  if (d === 1) {
    texto += DECENAS_10_19[u];
  } else if (d === 2 && u > 0) {
    const veintis = ['', 'veintiún ', 'veintidós ', 'veintitrés ', 'veinticuatro ', 'veinticinco ', 'veintiséis ', 'veintisiete ', 'veintiocho ', 'veintinueve '];
    texto += veintis[u];
  } else {
    texto += DECENAS[d];
    if (d > 2 && u > 0) texto += 'y ';
    texto += UNIDADES[u];
  }

  return texto;
}

/**
 * Convierte una cantidad numérica a formato legal en pesos mexicanos con centavos.
 * Ejemplo: 9451.20 -> "Nueve mil cuatrocientos cincuenta y uno 20/100 M.N."
 */
export function numeroALetrasPesos(monto: number): string {
  if (isNaN(monto) || monto < 0) return 'Cero pesos 00/100 M.N.';

  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  const strCentavos = centavos.toString().padStart(2, '0') + '/100 M.N.';

  if (entero === 0) return `Cero pesos ${strCentavos}`;

  let textoEntero = '';

  // Miles
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;

  if (millones > 0) {
    if (millones === 1) textoEntero += 'Un millón ';
    else textoEntero += convertirCentenas(millones) + 'millones ';
  }

  if (miles > 0) {
    if (miles === 1) textoEntero += 'Mil ';
    else textoEntero += convertirCentenas(miles) + 'mil ';
  }

  if (resto > 0) {
    textoEntero += convertirCentenas(resto);
  }

  textoEntero = textoEntero.trim();
  const inicialCap = textoEntero.charAt(0).toUpperCase() + textoEntero.slice(1);

  return `${inicialCap} ${strCentavos}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Formatea una fecha a español: "16 de enero del año 2026"
 */
export function formatearFechaLegal(fechaStr?: string): string {
  if (!fechaStr) {
    const hoy = new Date();
    return `${hoy.getDate()} de ${MESES[hoy.getMonth()]} del año ${hoy.getFullYear()}`;
  }

  if (fechaStr.toLowerCase().includes('de') && fechaStr.length > 8) {
    return fechaStr.replace(/^el día /i, '').replace(/^el /i, '').trim();
  }

  try {
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length === 3) {
      const anio = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const dia = parseInt(partes[2], 10);
      return `${dia} de ${MESES[mes]} del año ${anio}`;
    }
  } catch {
    // fallback
  }

  return fechaStr;
}

export function extraerDatosDeGuardia(guardia: any): Partial<DatosContrato> {
  if (!guardia) return {};

  let ficha: Record<string, any> = {};
  if (guardia.ficha_tecnica_json) {
    try {
      ficha = typeof guardia.ficha_tecnica_json === 'string'
        ? JSON.parse(guardia.ficha_tecnica_json)
        : guardia.ficha_tecnica_json;
    } catch (e) {
      console.error('Error parseando ficha técnica:', e);
    }
  }

  const nombre = (guardia.nombre || ficha.nombre || '').toUpperCase().trim();
  const puesto = (ficha.puesto || 'TÉCNICO EN SEGURIDAD PRIVADA').toUpperCase().trim();
  const rfc = (ficha.rfc || '').toUpperCase().trim();
  const curp = (ficha.curp || '').toUpperCase().trim();
  const edad = ficha.edad ? (ficha.edad.toString().toUpperCase().includes('AÑOS') ? ficha.edad : `${ficha.edad} AÑOS`) : '35 AÑOS';
  const estadoCivil = (ficha.estadoCivil || 'SOLTERO').toUpperCase().trim();
  const nacionalidad = (ficha.nacionalidad || 'MEXICANA').toUpperCase().trim();

  let dom = guardia.direccion || '';
  if (!dom && (ficha.calleNumero || ficha.colonia)) {
    const partes = [
      ficha.calleNumero,
      ficha.colonia ? `COL. ${ficha.colonia}` : '',
      ficha.cp ? `CP ${ficha.cp}` : '',
      ficha.delegacionMunicipio,
      ficha.estado,
    ].filter(Boolean);
    dom = partes.join('; ');
  }
  if (!dom) dom = 'calle de VIRGEN MARIA #19; COL. VIRGENCITAS; CP 57300 NEZAHUALCOYOTL, ESTADO DE MÉXICO';

  const fechaAltaFmt = formatearFechaLegal(guardia.fecha_alta);

  return {
    nombreTrabajador: nombre,
    puesto: puesto || 'TÉCNICO EN SEGURIDAD PRIVADA',
    rfcTrabajador: rfc,
    curpTrabajador: curp,
    edad,
    estadoCivil,
    nacionalidad,
    domicilioTrabajador: dom,
    fechaContrato: fechaAltaFmt,
    fechaInicioVigencia: fechaAltaFmt,
    fechaInicioAntiguedad: fechaAltaFmt,
    salarioMensualNumero: 9451.20,
    periodicidadPago: 'catorcenal',
  };
}

export const DATOS_CONTRATO_DEFAULT: DatosContrato = {
  puesto: 'TÉCNICO EN SEGURIDAD PRIVADA',
  ciudad: 'Ciudad de México',
  fechaContrato: '16 de enero del año 2026',
  representantePatronal: 'JUAN CARLOS ULLOA CASTILLEJOS',
  razonSocialPatronal: 'U3 SEGURIDAD PRIVADA,  S.A. DE C.V.',
  rfcPatronal: 'USP 2205057DA',
  domicilioPatronal: 'Avenida Insurgentes Sur No. 1915, despacho 401, Guadalupe Inn, Álvaro Obregón, C.P. 01020, Ciudad Capital',

  nombreTrabajador: 'ISRAEL MONROY SAN MARTIN',
  edad: '35 AÑOS',
  estadoCivil: 'SOLTERO',
  nacionalidad: 'MEXICANA',
  rfcTrabajador: 'MOSI891125H59',
  curpTrabajador: 'MOSI891125HMCNNS02',
  domicilioTrabajador: 'calle de VIRGEN MARIA #19; COL. VIRGENCITAS; CP 57300 NEZAHUALCOYOTL, ESTADO DE MÉXICO',

  diasLaboralesSemana: 6,
  diasPruebaInicial: 30,
  diasPruebaMaximo: 180,
  fechaInicioVigencia: '16 de enero del año 2026',
  salarioMensualNumero: 9451.20,
  periodicidadPago: 'catorcenal',
  fechaInicioAntiguedad: '16 de enero del año 2026',

  beneficiarioNombre: 'NANCY SAN MARTIN GONZALEZ',
  beneficiarioPorcentaje: '100%',
  beneficiarioParentesco: 'MADRE',
};

/**
 * Envuelve datos personales o contractuales críticos en un marcador visual ámbar.
 * En pantalla se muestra en ámbar para facilitar la revisión del usuario y evitar errores;
 * al imprimirse o guardarse en PDF, las reglas CSS @media print lo convierten
 * a texto idéntico y limpio sin ningún fondo, borde ni color especial.
 */
export function resaltarCritico(valor: string | number | undefined | null, etiqueta?: string, campo?: string): string {
  const str = String(valor ?? '').trim();
  if (!str) return '';
  const slugCampo = campo || (etiqueta ? etiqueta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-') : '');
  const attrCampo = slugCampo ? ` data-campo="${slugCampo}"` : '';
  return `<span class="dato-critico"${attrCampo} title="${etiqueta ? `${etiqueta}: ` : ''}Dato crítico para revisión">${str}</span>`;
}

/**
 * Genera el documento ContenidoDoc COPIA IDÉNTICA del archivo original CONTRATO_LABORAL.docx
 * Sin portada ni índice. Con las 5 hojas y saltos idénticos al original.
 * Remarca en color ámbar los datos personales y críticos para revisión en pantalla (no se imprimen).
 */
export function generarContenidoContrato(datosIn: Partial<DatosContrato>): ContenidoDoc & { sinPortadaNiIndice: boolean } {
  const d: DatosContrato = { ...DATOS_CONTRATO_DEFAULT, ...datosIn };
  const salarioLetra = d.salarioMensualLetra || numeroALetrasPesos(d.salarioMensualNumero);
  const salarioFormateado = d.salarioMensualNumero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Campos críticos marcados en ámbar
  const cPuesto = resaltarCritico(d.puesto.toUpperCase(), 'Puesto', 'puesto');
  const cCiudad = resaltarCritico(d.ciudad, 'Ciudad', 'ciudad');
  const cFechaContrato = resaltarCritico(d.fechaContrato, 'Fecha de contrato', 'fecha-contrato');
  const cRazonSocialPatronal = resaltarCritico(d.razonSocialPatronal, 'Patrón', 'patron-razon-social');
  const cRepresentantePatronal = resaltarCritico(d.representantePatronal, 'Representante legal', 'representante-legal');
  const cDomicilioPatronal = resaltarCritico(d.domicilioPatronal, 'Domicilio patronal', 'domicilio-patronal');
  const cRfcPatronal = resaltarCritico(d.rfcPatronal, 'RFC patronal', 'rfc-patronal');

  // Datos personales del trabajador (nombre, rfc, curp, domicilio, edad, edo civil, nacionalidad)
  const cNombreTrabajador = resaltarCritico(d.nombreTrabajador, 'Nombre del trabajador', 'nombre-trabajador');
  const cEdad = resaltarCritico(d.edad, 'Edad', 'edad');
  const cEstadoCivil = resaltarCritico(d.estadoCivil, 'Estado civil', 'estado-civil');
  const cNacionalidad = resaltarCritico(d.nacionalidad, 'Nacionalidad', 'nacionalidad');
  const cRfcTrabajador = resaltarCritico(d.rfcTrabajador, 'RFC trabajador', 'rfc-trabajador');
  const cCurpTrabajador = resaltarCritico(d.curpTrabajador, 'CURP trabajador', 'curp-trabajador');
  const cDomicilioTrabajador = resaltarCritico(d.domicilioTrabajador, 'Domicilio del trabajador', 'domicilio-trabajador');

  // Fechas y condiciones críticas
  const cDiasPruebaInicial = resaltarCritico(d.diasPruebaInicial, 'Días de prueba', 'dias-prueba');
  const cDiasPruebaMaximo = resaltarCritico(d.diasPruebaMaximo, 'Días de prueba máx.', 'dias-prueba-max');
  const cFechaInicioVigencia = resaltarCritico(d.fechaInicioVigencia, 'Inicio de vigencia', 'inicio-vigencia');
  const cSalarioNum = resaltarCritico(salarioFormateado, 'Salario mensual', 'salario-num');
  const cSalarioLetra = resaltarCritico(salarioLetra, 'Salario en letra', 'salario-letra');
  const cPeriodicidad = resaltarCritico(d.periodicidadPago, 'Periodicidad', 'periodicidad');

  // Beneficiario legal
  const cBeneficiarioNombre = resaltarCritico(d.beneficiarioNombre, 'Beneficiario', 'beneficiario-nombre');
  const cBeneficiarioPorcentaje = resaltarCritico(d.beneficiarioPorcentaje, 'Porcentaje', 'beneficiario-porcentaje');
  const cBeneficiarioParentesco = resaltarCritico(d.beneficiarioParentesco, 'Parentesco', 'beneficiario-parentesco');
  const cFechaInicioAntiguedad = resaltarCritico(d.fechaInicioAntiguedad, 'Fecha de antigüedad', 'fecha-antiguedad');

  return {
    version: '1.0',
    sinPortadaNiIndice: true,
    secciones: [
      {
        id: 'sec-contrato-laboral-u3',
        tipo: 'protocolo',
        numero: '',
        titulo: '',
        bloques: [
          // ==================== HOJA 1 ====================
          {
            tipo: 'parrafo',
            texto: `<p style="text-align:center;margin-bottom:2px"><strong>CONTRATO INDIVIDUAL DE TRABAJO</strong></p><p style="text-align:center;margin-bottom:2px"><strong>TIEMPO INDETERMINADO (PERIODO DE PRUEBA)</strong></p><p style="text-align:center;margin-bottom:18px"><strong>${cPuesto}</strong></p>`,
          },
          {
            tipo: 'parrafo',
            texto: `En la ${cCiudad}, el día <strong>${cFechaContrato}</strong>, los que suscribimos el presente, a saber, <strong>${cRazonSocialPatronal}</strong>, representada en este acto por el <strong>Sr. ${cRepresentantePatronal}</strong>, a quien en lo sucesivo se le denominará el <strong>PATRÓN</strong> y por la otra parte el <strong>SR. ${cNombreTrabajador}</strong> por su propio derecho, a quien en adelante se le denominará el <strong>TRABAJADOR</strong>, hacemos constar que hemos convenido en celebrar un contrato individual de trabajo, en los términos del artículo 39-A de la Ley Federal del Trabajo, al tenor de las siguientes declaraciones y cláusulas:`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-align:center;margin-top:14px;margin-bottom:12px;letter-spacing:0.25em"><strong>D E C L A R A C I O N E S</strong></p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<strong>I.&emsp;Declara el PATRÓN, por conducto de su representante:</strong>`,
          },
          {
            tipo: 'parrafo',
            texto: `a.&emsp;Que para los efectos del artículo 25 de la Ley Federal del Trabajo manifiesta que se dedica principalmente a la prestación de servicios de <strong>seguridad privada</strong>; que tiene su domicilio en Avenida Insurgentes Sur No. 1915, despacho 401, Guadalupe Inn, Álvaro Obregón, C.P. 01020, Ciudad Capital con número de Registro Federal de Contribuyentes <strong>${cRfcPatronal}</strong>.`,
          },
          {
            tipo: 'parrafo',
            texto: `b.&emsp;Que para cumplir con su objeto social, tiene necesidad de contratar los servicios del <strong>TRABAJADOR</strong> para que reciba una <strong>CAPACITACIÓN INICIAL</strong>, a efecto de que se encuentre en posibilidades de desempeñar un trabajo personal y subordinado, como <strong>GUARDIA DE SEGURIDAD PRIVADA</strong>, y poder llevar a cabo las funciones y actividades que se señalan en el presente instrumento.`,
          },
          {
            tipo: 'parrafo',
            texto: `<strong>II.&emsp;Declara el TRABAJADOR, por su propio derecho:</strong>`,
          },
          {
            tipo: 'parrafo',
            texto: `a.&emsp;Llamarse, <strong>${cNombreTrabajador}</strong> ser de <strong>${cEdad}</strong>, de estado civil <strong>${cEstadoCivil}</strong>, de nacionalidad <strong>${cNacionalidad}</strong>, con R.F.C. <strong>${cRfcTrabajador}</strong> y CURP <strong>${cCurpTrabajador}</strong>.`,
          },
          {
            tipo: 'parrafo',
            texto: `b.&emsp;Que tiene su domicilio en la calle de <strong>${cDomicilioTrabajador}</strong>, mismo que señala para oír y recibir toda clase de notificaciones y documentos.`,
          },
          {
            tipo: 'parrafo',
            texto: `c.&emsp;Que reconoce y acepta que a la firma del presente contrato, no cuenta con conocimientos, capacitación, habilidades, certificación, ni la experiencia necesaria o suficiente para el puesto que va a desempeñar, por lo que acepta prestar sus servicios subordinados conforme se establece en las cláusulas del presente contrato por un período inicial de capacitación como <strong>GUARDIA DE SEGURIDAD PRIVADA</strong>, en la inteligencia de que una vez concluido dicho periodo y si demuestra tener aptitudes para el cargo la relación de trabajo continuará por tiempo indeterminado, de lo contrario y conforme a lo señalado en las cláusulas siguientes de éste instrumento la relación de trabajo se dará por terminada sin ninguna responsabilidad para el <strong>PATRÓN</strong>.`,
          },
          {
            tipo: 'parrafo',
            texto: `d.&emsp;Que a la celebración del presente contrato no pertenece a ninguna institución, corporación pública o privada dedicada a la seguridad.`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-align:center;margin-top:14px;margin-bottom:12px;letter-spacing:0.25em"><strong>C L Á U S U L A S</strong></p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>1.</strong> Ambas partes convienen en que conforme al artículo 39-A de la Ley Federal del Trabajo, el presente contrato tendrá un período de capacitación inicial de <strong>${cDiasPruebaInicial} días</strong> el cual podrá extenderse hasta <strong>${cDiasPruebaMaximo} (CIENTO OCHENTA) días</strong> improrrogables si así lo determina el <strong>PATRÓN</strong>, a efecto de que el <strong>TRABAJADOR</strong> pueda acreditar que ha adquirido los conocimientos y habilidades necesarias para desempeñar el cargo de <strong>GUARDIA DE SEGURIDAD PRIVADA</strong> y por consiguiente que cumple con los requisitos y tiene aptitudes suficientes para el desempeño de las funciones inherentes al cargo, de no acreditar el <strong>TRABAJADOR</strong> que es competente para desarrollar las labores encomendadas y atento a lo dispuesto por el artículo 39-A de la Ley Federal del Trabajo y previa opinión de la Comisión Mixta de</p>`,
          },
          {
            tipo: 'salto',
          },

          // ==================== HOJA 2 ====================
          {
            tipo: 'parrafo',
            texto: `Productividad, Capacitación y Adiestramiento se dará por terminada la relación del trabajo sin responsabilidad para el <strong>PATRÓN</strong>.`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>2.</strong> Lo antes mencionado en virtud de que el <strong>TRABAJADOR</strong> ha manifestado que, a la fecha de firma del presente contrato, no cuenta con conocimientos, capacitación, habilidades, certificación, ni la experiencia necesaria o suficiente para el puesto que va a desempeñar, por consiguiente, se compromete a dedicar su mejor esfuerzo para acreditar la competencia.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">La vigencia del presente contrato de capacitación inicial surtirá efectos a partir de la fecha de firma del presente instrumento, con fecha <strong>${cFechaInicioVigencia}</strong>.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">Durante la vigencia del presente contrato y conforme lo establecido por los artículos 39-A, 39-B, 39-C, 39-D y 39-E de la Ley Federal del Trabajo, el <strong>TRABAJADOR</strong> disfrutará del salario que se estípula en la <strong>CLÁUSULA 7 (SIETE)</strong> y de las prestaciones de ley.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>4.</strong> Queda expresamente convenido que el <strong>TRABAJADOR</strong> acatará en todo momento las disposiciones del Reglamento Interior de Trabajo, las ordenes, circulares y disposiciones que dicte el <strong>PATRÓN</strong>, sus representantes y sus superiores, así como todos los ordenamientos que le sean aplicables de acuerdo a las atribuciones y obligaciones que la capacitación para el puesto le determinen. De igual forma se obliga a respetar las disposiciones de índole normativo y de seguridad tanto del <strong>PATRÓN</strong> como de los lugares en donde se lleve a cabo la capacitación para el trabajo.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>5.</strong> Conforme a lo dispuesto por el artículo 25 de la Ley Federal del Trabajo, de manera enunciativa pero no limitativa el <strong>TRABAJADOR</strong> deberá llevar a cabo las siguientes actividades: <strong>CAPACITACIÓN INICIAL como GUARDIA DE SEGURIDAD PRIVADA</strong> para el resguardo de bienes y control de accesos. En consecuencia el <strong>TRABAJADOR</strong> se obliga a realizar las actividades relacionadas a dicha capacitación inicial, prestando siempre sus servicios personales subordinado jurídicamente al <strong>PATRÓN</strong>, con esmero, eficiencia, ética y honradez y por la naturaleza del trabajo que va a desempeñar así como por la actividad comercial del <strong>PATRÓN</strong>, el <strong>TRABAJADOR</strong> se obliga a desempeñar sus actividades en las oficinas, talleres o locales que el <strong>PATRÓN</strong> le indique ya sean de su propiedad o de terceras personas físicas, morales o instituciones; y cuando el <strong>PATRÓN</strong> lo estime conveniente podrá reubicarlo o cambiarlo de servicio o lugar de trabajo, en virtud de lo cual el <strong>TRABAJADOR</strong> en este acto da su expreso consentimiento para desempeñar sus labores en el domicilio que el <strong>PATRÓN</strong> le indique y a ser cambiado o reubicado cuando sus superiores así lo consideren conveniente y sin previo aviso.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>6.</strong> En virtud de la naturaleza del trabajo y de las actividades que va a desarrollar el <strong>TRABAJADOR</strong> y de acuerdo o lo antes mencionado, reconoce expresamente que su único empleador es el <strong>PATRÓN</strong>, para el cual prestará un trabajo personal y subordinado, asimismo como también que no se genera derecho o vínculo laboral con ningún cliente del <strong>PATRÓN</strong>.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>7. El TRABAJADOR</strong> percibirá, por la prestación de los servicios a que se refiere este contrato, un salario de <strong>$${cSalarioNum} (${cSalarioLetra}) mensuales</strong>, el cual incluye el pago de los días de descanso semanal que contenga el mes, así como el pago de los días de descanso obligatorio cuando los haya, menos deducciones y retenciones que correspondan por ley.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">El salario se le pagará proporcionalmente en <strong>forma ${cPeriodicidad}</strong>, en caso de que un día de pago sea día inhábil, la remuneración se pagará el día hábil anterior; estando obligado el <strong>TRABAJADOR</strong> a firmar las constancias de pago respectivas.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">El pago podrá ser en efectivo, cheque, depósito o transferencia electrónica, por lo que el <strong>TRABAJADOR</strong> en este otorga su consentimiento para que el salario y cualquier otra percepción a que tenga derecho, sea depositada en una cuenta de institución bancaria, de nómina, de débito, transferencia o cualquier otro medio electrónico que para tal efecto aperture el <strong>PATRÓN</strong> a nombre del <strong>TRABAJADOR</strong>, en la inteligencia de que posterior a la entrega de su tarjeta de nómina, será de su única y absoluta responsabilidad cualquier retiro o cargo que aparezca en la misma.</p>`,
          },
          {
            tipo: 'salto',
          },

          // ==================== HOJA 3 ====================
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">El <strong>TRABAJADOR</strong> se obliga a descargar de internet e imprimir el Comprobante Fiscal Digital <strong>(CFDI)</strong>, el cual se le podrá proporcionar mediante correo electrónico, dicho Comprobante Fiscal Digital <strong>(CFDI)</strong> así como el comprobante del depósito que el <strong>PATRÓN</strong> realice en la cuenta antes mencionada, serán considerados como recibo de pago de salario y percepciones a que tenga derecho el <strong>TRABAJADOR</strong>.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>El TRABAJADOR</strong> deberá de manera inmediata, aclara las dudas que tenga respecto de los salarios o percepciones que le sean pagados acudiendo al área de Recursos Humanos.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>8.</strong> El <strong>TRABAJADOR</strong> acepta que la duración de la jornada laboral será señalada por el <strong>PATRÓN</strong> de acuerdo a las necesidades del servicio al que sea asignado, laborando <strong>6 (SEIS) días a la semana</strong>, durante la jornada laboral el <strong>TRABAJADOR</strong> gozará de un período de descanso para tomar sus alimentos fuera de las instalaciones a la que se encuentre asignado.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">En virtud de lo antes mencionado y atendiendo a lo señalado por el artículo 59 de la Ley Federal del Trabajo, el <strong>PATRÓN</strong> queda facultado por el <strong>TRABAJADOR</strong> para establecer horarios continuos y discontinuos de acuerdo a las necesidades del servicio al que se encuentre asignado el <strong>TRABAJADOR</strong>, en la inteligencia que únicamente será considerado tiempo extraordinario el que exceda el límite semanal establecido en la Ley Federal del Trabajo,</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>9.</strong> Cuando por circunstancias extraordinarias se aumente la jornada de trabajo, los servicios prestados durante el tiempo excedente se consideran como extraordinarios y se pagará en la forma establecida por la Ley. Las horas y los días de trabajo extraordinario, solo podrán ser señalados por el <strong>PATRÓN</strong>, mediante previa orden que al respecto se haya dado por escrito.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>10.</strong> Por cada seis días de trabajo el <strong>TRABAJADOR</strong> tendrá un día de descanso, conviniéndose en que dicho día de descanso lo disfrutará preferentemente el día domingo de cada semana, sin perjuicio de que la <strong>PATRÓN</strong> modifique dicho día de descanso semanal cuando las necesidades del servicio así lo requieran pagando la prima dominical que marca el artículo 71 de la ley, disfrutando también de los días de descanso obligatorios conforme a lo señalado en el artículo 74 de la Ley Federal del Trabajo</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>11.</strong> El <strong>TRABAJADOR</strong> está obligado a firmar las listas de asistencia o la modalidad que el <strong>PATRÓN</strong> indique, a la entrada y salida de sus labores, por lo que el incumplimiento de este requisito indicará la falta injustificada a sus labores, para todos los efectos legales.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>12.</strong> Cuando el <strong>TRABAJADOR</strong> falte a sus labores deberá de notificar y justificar al <strong>PATRÓN</strong> de manera inmediata su ausencia a sus labores con certificado de incapacidad que expide el Instituto Mexicano de Seguro Social, o cuando solicite permiso para faltar a sus labores, deberá solicitar previamente permiso por escrito de su jefe inmediato, con el visto bueno del departamento de Recursos Humanos, de lo contrario se considerará cualquier falta como injustificada.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>13.</strong> Conforme lo dispone el artículo 76 de la materia, el <strong>TRABAJADOR</strong> tendrá derecho a un período anual de vacaciones de 12 días para el primer año de servicio y en el caso de que no haya cumplido un año de trabajo, tendrá derecho a que se le paguen vacaciones en proporción al tiempo trabajado en los términos de la Ley de la Materia.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>14.</strong> El <strong>TRABAJADOR</strong> percibirá un aguinaldo anual, que deberá pagársele antes del día veinte de diciembre de cada año, equivalente a quince días de salario. Cuando no haya cumplido el año de servicios, tendrá derecho a que se le pague en proporción al tiempo trabajado.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>15.</strong> El <strong>TRABAJADOR</strong> reconoce y acepta que son propiedad exclusiva del <strong>PATRÓN</strong>, el material, equipo, herramientas, uniformes, documentos, formatos, así como cualquier otro material que se le proporcionen para el desempeño de sus funciones, comprometiéndose a utilizarlos en forma adecuada y a conservarlos en buen estado cuando la naturaleza del bien que se le proporciona así lo requiera, firmando los acuses de recibo que correspondan y comprometiéndose a devolverlos cuando le sea requerido o bien al terminar el presente Contrato, por el motivo que fuere.</p>`,
          },
          {
            tipo: 'salto',
          },

          // ==================== HOJA 4 ====================
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>16.</strong> El <strong>TRABAJADOR</strong> reconoce que todos los documentos e información que se le proporcione con motivo de la relación de trabajo, así como los que el propio <strong>TRABAJADOR</strong> prepare o formule en relación o conexión con su trabajo; son propiedad exclusiva del <strong>PATRÓN</strong>, por lo que se obliga a conservarlos en buen estado y entregarlos al <strong>PATRÓN</strong> en el momento en que éste lo requiera o bien al terminar el presente Contrato, por el motivo que fuere.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>17.</strong> El <strong>TRABAJADOR</strong> se obliga a guardar absoluta confidencialidad sobre cualquier tipo de información, datos y documentos a que tenga acceso en virtud de la relación laboral y a no usarlos en beneficio propio, ni a divulgar por ningún medio o forma, directa o indirectamente, en todo o en parte, ni sobre cualquiera de los aspectos de los negocios del <strong>PATRÓN</strong>, ni de sus clientes, agentes, concesionarios, distribuidores, asociados, filiales, licenciatarios contratantes o cualquier otro tercero que tenga relación con el <strong>PATRÓN</strong>, salvo que sea autorizado directamente por escrito por un representante legal del <strong>PATRÓN</strong> o por mandamiento de autoridad competente que funde y motive el requerimiento de la información.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">Si el <strong>TRABAJADOR</strong> dejare de cumplir con las disposiciones de esta cláusula quedará sujeto a la rescisión del presente contrato y a la responsabilidad civil por daños y perjuicios que causare al <strong>PATRÓN</strong>, así como a las sanciones penales a que se hiciere acreedor.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>18.</strong> Para los efectos del artículo 25 en relación con el 501 de la Ley federal del Trabajo, el <strong>TRABAJADOR</strong> designa como su beneficiario para el pago de los salarios y prestaciones devengadas y no cobradas en caso de su muerte o por los salarios y prestaciones devengadas y no cobradas que se generen por su fallecimiento o desaparición derivada de un acto delincuencial a la (las) persona (s) con los porcentajes que se indican, observando siempre lo dispuesto en el siguiente artículo.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px">Artículo 501.- Tendrán derecho a recibir indemnización en los casos de muerte o desaparición derivada de un acto delincuencial: I. La viuda o el viudo, los hijos menores de dieciocho años y los mayores de esta edad si tienen una incapacidad de cincuenta por ciento o más, así como los hijos de hasta veinticinco años que se encuentran estudiando en algún plantel del sistema educativo nacional; en ningún caso se efectuará la investigación de dependencia económica, dado que estos reclamantes tienen la presunción a su favor de la dependencia económica; Los ascendientes concurrirán con las personas mencionadas en la fracción anterior sin necesidad de realizar investigación económica, a menos que se pruebe que no dependían económicamente del trabajador III. A falta de cónyuge supérstite, concurrirá con las personas señaladas en las dos fracciones anteriores, la persona con quien el trabajador vivió como si fuera su cónyuge durante los cinco años que precedieron inmediatamente a su muerte, o con la que tuvo hijos, sin necesidad de realizar investigación económica, siempre que ambos hubieran permanecido libres de matrimonio durante el concubinato; IV. Las personas que dependían económicamente del trabajador concurrirán con quienes estén contemplados en cualquiera de las hipótesis de las fracciones anteriores, debiendo acreditar la dependencia económica, y V. A falta de las personas mencionadas en las fracciones anteriores, el Instituto Mexicano del Seguro Social.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="margin-top:12px;margin-bottom:6px;text-indent:28px">NOMBRE</p><table style="width:100%;border-collapse:collapse;border:none;margin-bottom:10px"><tr><td style="border:none;padding:0;width:45%;color:#ff0000;font-weight:bold;text-indent:28px"><strong style="color:#ff0000">${cBeneficiarioNombre}</strong></td><td style="border:none;padding:0;width:30%;color:#ff0000;font-weight:bold;text-align:center"><strong style="color:#ff0000">PORCENTAJE &nbsp; ${cBeneficiarioPorcentaje}</strong></td><td style="border:none;padding:0;width:25%;color:#ff0000;font-weight:bold;text-align:right"><strong style="color:#ff0000">PARENTESCO &nbsp; ${cBeneficiarioParentesco}</strong></td></tr></table>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>19.</strong> El <strong>TRABAJADOR</strong> conviene en someterse a los reconocimientos médicos que periódicamente ordene el <strong>PATRÓN</strong>, los previstos en el reglamento interior de trabajo, normas vigentes, así como los que ordenen las autoridades competentes en razón del giro comercial del <strong>PATRÓN</strong>.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>20.</strong> El <strong>PATRÓN</strong> se compromete a proporcionar la capacitación y el adiestramiento, de acuerdo a los planes y programas establecidos o que se establezcan, conforme a lo dispuesto por la ley federal del trabajo, así como los que determinen las autoridades competentes, en razón del giro comercial del <strong>PATRÓN</strong>.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>21.</strong> Para efectos de antigüedad, ambas partes reconocen que el <strong>TRABAJADOR</strong>, comenzó a prestar sus servicios para el <strong>PATRÓN</strong> <strong>el ${cFechaInicioAntiguedad}.</strong></p>`,
          },
          {
            tipo: 'salto',
          },

          // ==================== HOJA 5 ====================
          {
            tipo: 'parrafo',
            texto: `<p style="text-indent:28px"><strong>22.</strong> Ambas partes convienen en que, respecto a las obligaciones y derechos que mutuamente les corresponden y que no hayan sido motivo de cláusula expresa en el presente Contrato, se sujetan a las disposiciones del Reglamento Interior de trabajo y a la Ley Federal del Trabajo.</p>`,
          },
          {
            tipo: 'parrafo',
            texto: `Leído que fue este contrato por ambas partes, e impuestas de su contenido y fuerza legal lo firmaron, quedando un tanto en poder de las mismas.`,
          },
          {
            tipo: 'parrafo',
            texto: `<table style="width:100%;border-collapse:collapse;border:none;margin-top:75px"><tr><td style="width:50%;text-align:center;vertical-align:top;border:none;padding:0 24px"><p style="margin:0 0 70px 0;font-weight:bold;font-size:13px">EL PATRÓN</p><p style="margin:0;font-size:13px;font-weight:bold;color:#000000">REPRESENTANTE LEGAL</p><p style="margin:2px 0 0 0;font-size:13px;font-weight:bold;color:#000000">${cRazonSocialPatronal}</p></td><td style="width:50%;text-align:center;vertical-align:top;border:none;padding:0 24px"><p style="margin:0 0 70px 0;font-weight:bold;font-size:13px">EL TRABAJADOR</p><p style="margin:0;font-size:13px;color:transparent;user-select:none">&nbsp;</p><p style="margin:2px 0 0 0;font-size:13px;font-weight:bold;color:#000000">${cNombreTrabajador}</p></td></tr></table>`,
          },
        ],
      },
    ],
  };
}

/** Valor real de cada dato crítico (ámbar), indexado por el mismo slug que
 *  `resaltarCritico` graba en `data-campo`. Es la contraparte de
 *  `generarContenidoContrato`: en vez de construir el HTML de cada cláusula
 *  desde cero, esto solo dice "el campo tal vale tal cosa" para un guardia
 *  dado, sin importar en qué bloque de la plantilla aparezca. */
function valoresPorCampo(datosIn: Partial<DatosContrato>): Record<string, string> {
  const d: DatosContrato = { ...DATOS_CONTRATO_DEFAULT, ...datosIn };
  const salarioLetra = d.salarioMensualLetra || numeroALetrasPesos(d.salarioMensualNumero);
  const salarioFormateado = d.salarioMensualNumero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    'puesto': d.puesto.toUpperCase(),
    'ciudad': d.ciudad,
    'fecha-contrato': d.fechaContrato,
    'patron-razon-social': d.razonSocialPatronal,
    'representante-legal': d.representantePatronal,
    'domicilio-patronal': d.domicilioPatronal,
    'rfc-patronal': d.rfcPatronal,
    'nombre-trabajador': d.nombreTrabajador,
    'edad': d.edad,
    'estado-civil': d.estadoCivil,
    'nacionalidad': d.nacionalidad,
    'rfc-trabajador': d.rfcTrabajador,
    'curp-trabajador': d.curpTrabajador,
    'domicilio-trabajador': d.domicilioTrabajador,
    'dias-prueba': String(d.diasPruebaInicial),
    'dias-prueba-max': String(d.diasPruebaMaximo),
    'inicio-vigencia': d.fechaInicioVigencia,
    'salario-num': salarioFormateado,
    'salario-letra': salarioLetra,
    'periodicidad': d.periodicidadPago,
    'beneficiario-nombre': d.beneficiarioNombre,
    'beneficiario-porcentaje': d.beneficiarioPorcentaje,
    'beneficiario-parentesco': d.beneficiarioParentesco,
    'fecha-antiguedad': d.fechaInicioAntiguedad,
  };
}

/**
 * Plantillas guardadas antes de que `resaltarCritico` grabara `data-campo`
 * solo traen `title="Etiqueta: Dato crítico para revisión"`. Este mapa
 * traduce esa etiqueta (tal cual se le pasa a `resaltarCritico` en
 * `generarContenidoContrato`) al mismo slug que usa `valoresPorCampo`, para
 * que una plantilla vieja siga pudiendo sustituirse por campo.
 */
const ETIQUETA_A_CAMPO: Record<string, string> = {
  'puesto': 'puesto',
  'ciudad': 'ciudad',
  'fecha de contrato': 'fecha-contrato',
  'patrón': 'patron-razon-social',
  'representante legal': 'representante-legal',
  'domicilio patronal': 'domicilio-patronal',
  'rfc patronal': 'rfc-patronal',
  'nombre del trabajador': 'nombre-trabajador',
  'edad': 'edad',
  'estado civil': 'estado-civil',
  'nacionalidad': 'nacionalidad',
  'rfc trabajador': 'rfc-trabajador',
  'curp trabajador': 'curp-trabajador',
  'domicilio del trabajador': 'domicilio-trabajador',
  'días de prueba': 'dias-prueba',
  'días de prueba máx.': 'dias-prueba-max',
  'inicio de vigencia': 'inicio-vigencia',
  'salario mensual': 'salario-num',
  'salario en letra': 'salario-letra',
  'periodicidad': 'periodicidad',
  'beneficiario': 'beneficiario-nombre',
  'porcentaje': 'beneficiario-porcentaje',
  'parentesco': 'beneficiario-parentesco',
  'fecha de antigüedad': 'fecha-antiguedad',
};

function resolverSlugDeCritico(atributos: string): string | null {
  const porCampo = atributos.match(/\bdata-campo="([^"]+)"/i);
  if (porCampo) return porCampo[1];
  const porTitulo = atributos.match(/\btitle="([^":]+):/i);
  if (porTitulo) return ETIQUETA_A_CAMPO[porTitulo[1].trim().toLowerCase()] ?? null;
  return null;
}

/**
 * Toma una Plantilla Base guardada por el usuario (con su composición y
 * redacción editadas a mano) y le inyecta los datos de OTRO guardia,
 * sustituyendo únicamente el contenido de los `<span class="dato-critico">`
 * — la estructura, el texto fijo y los saltos de hoja de la plantilla se
 * conservan tal cual, solo cambian los valores en ámbar. Reconoce tanto el
 * `data-campo` actual como el `title` de plantillas guardadas antes de que
 * existiera ese atributo. Así "Usar como Plantilla Base" deja de ser un
 * guardado sin efecto: los contratos siguientes parten de esta composición
 * en vez de la fija.
 */
export function aplicarDatosAPlantilla(plantilla: ContenidoDoc, datosIn: Partial<DatosContrato>): ContenidoDoc {
  const valores = valoresPorCampo(datosIn);
  // El lookahead exige que la etiqueta que se está abriendo tenga
  // class="dato-critico" ANTES de intentar capturarla, así que un <span>
  // envolvente sin esa clase (p. ej. uno de estilo que anida el crítico
  // adentro) nunca entra en juego — el primer match real es siempre el span
  // crítico más interno, sin que la anidación rompa el emparejamiento.
  const spanRegex = /<span\b(?=[^>]*\bclass="[^"]*\bdato-critico\b[^"]*")([^>]*)>([\s\S]*?)<\/span>/gi;

  const reemplazarEnTexto = (texto: string) =>
    texto.replace(spanRegex, (coincidencia, atributos, _valorViejo) => {
      const slug = resolverSlugDeCritico(atributos);
      if (!slug) return coincidencia;
      const nuevoValor = valores[slug];
      return nuevoValor !== undefined ? `<span${atributos}>${nuevoValor}</span>` : coincidencia;
    });

  return {
    ...plantilla,
    secciones: plantilla.secciones.map((seccion) => ({
      ...seccion,
      bloques: seccion.bloques.map((b) => ('texto' in b ? { ...b, texto: reemplazarEnTexto(b.texto) } : b)),
    })),
  };
}

