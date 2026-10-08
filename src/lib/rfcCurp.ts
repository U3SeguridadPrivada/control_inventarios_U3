/**
 * Cálculo automático de CURP y RFC (persona física) a partir de los datos de
 * identidad: nombre(s), primer y segundo apellido, fecha de nacimiento, sexo y
 * LUGAR DE NACIMIENTO (no el domicilio actual: la CURP lleva la entidad donde
 * nació la persona).
 *
 * Ambas claves se proponen como "estimadas" y quedan editables, porque hay dos
 * datos que solo asigna la autoridad cuando hay homónimos:
 *  - CURP, posición 17 (diferenciador): RENAPO la cambia solo si detecta otra
 *    persona con los mismos datos; aquí va el valor por defecto ('0' o 'A').
 *  - RFC, homoclave (posiciones 11-13): el SAT la asigna con el algoritmo
 *    público de homonimia y la reasigna si hay coincidencias. Aquí se calcula
 *    con ese algoritmo, pero conviene confirmarla con la Constancia de
 *    Situación Fiscal.
 */
import { ESTADOS_MEXICO } from '@/src/lib/direccionMexico';

// Módulo puro (sin componentes de interfaz): lo usan también el generador de contratos y las rutas del servidor.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

/**
 * Mayúsculas sin acentos y solo letras/espacios. La Ñ se conserva porque la
 * CURP y el RFC le dan tratamiento propio (NFD la separaría de su virgulilla).
 * Guiones y diagonales funcionan como separador de palabras; puntos y
 * apóstrofos se descartan ("MA." -> "MA", "D'ANGELO" -> "DANGELO").
 */
function limpiar(texto: string): string {
  return (texto || '')
    .normalize('NFC')
    .split('')
    .map((ch) => (ch === 'ñ' || ch === 'Ñ' ? 'Ñ' : ch.normalize('NFD')[0]))
    .join('')
    .toUpperCase()
    .replace(/[-/]/g, ' ')
    .replace(/[^A-ZÑ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara nombres sin importar acentos, mayúsculas ni espacios repetidos. */
export function mismoNombre(a: string, b: string): boolean {
  return limpiar(a) === limpiar(b);
}

/* ------------------------------------------------------------------ */
/* Nombre completo <-> partes                                          */
/* ------------------------------------------------------------------ */

export interface NombreDividido {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

/** Partículas que forman parte de un apellido compuesto ("de la Cruz", "van Gogh"). */
const CONECTORES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'MC', 'MAC', 'VON', 'VAN', 'DA', 'DI', 'SAN', 'SANTA']);

/**
 * Heurística para nombres capturados en un solo campo: los apellidos son las
 * últimas 1-2 "palabras" (con sus conectores). Es solo una propuesta inicial:
 * los formularios piden las tres partes por separado y esta función se usa
 * únicamente para expedientes antiguos que guardaron el nombre completo.
 */
export function dividirNombreCompleto(nombreCompleto: string): NombreDividido {
  const palabras = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return { nombres: '', apellidoPaterno: '', apellidoMaterno: '' };
  if (palabras.length === 1) return { nombres: palabras[0], apellidoPaterno: '', apellidoMaterno: '' };
  if (palabras.length === 2) return { nombres: palabras[0], apellidoPaterno: palabras[1], apellidoMaterno: '' };

  let i = palabras.length - 1;
  const materno: string[] = [palabras[i]];
  i--;
  while (i >= 0 && CONECTORES.has(limpiar(palabras[i]))) {
    materno.unshift(palabras[i]);
    i--;
  }
  const paterno: string[] = [];
  if (i >= 0) {
    paterno.unshift(palabras[i]);
    i--;
    while (i >= 0 && CONECTORES.has(limpiar(palabras[i]))) {
      paterno.unshift(palabras[i]);
      i--;
    }
  }
  const nombres = palabras.slice(0, i + 1).join(' ');
  return {
    nombres: nombres || paterno.join(' ') || materno.join(' '),
    apellidoPaterno: paterno.join(' '),
    apellidoMaterno: materno.join(' '),
  };
}

/** "Nombre(s) Apellido paterno Apellido materno", sin espacios sobrantes. */
export function unirNombreCompleto(p: Partial<NombreDividido>): string {
  return [p.nombres, p.apellidoPaterno, p.apellidoMaterno]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Partes del nombre de un expediente: usa las que se capturaron por separado
 * mientras sigan coincidiendo con el nombre completo (si alguien lo corrigió
 * en otra pantalla, ya no valen) y, si no, propone una división.
 */
export function partesDeNombre(nombreCompleto: string, guardadas?: Partial<NombreDividido> | null): NombreDividido {
  if (guardadas && (guardadas.nombres || guardadas.apellidoPaterno)) {
    const union = unirNombreCompleto(guardadas);
    if (union && mismoNombre(union, nombreCompleto)) {
      return {
        nombres: guardadas.nombres || '',
        apellidoPaterno: guardadas.apellidoPaterno || '',
        apellidoMaterno: guardadas.apellidoMaterno || '',
      };
    }
  }
  return dividirNombreCompleto(nombreCompleto);
}

/* ------------------------------------------------------------------ */
/* Fecha                                                               */
/* ------------------------------------------------------------------ */

const ANIO_MINIMO = 1900;

function diasDelMes(mIdx: number, anio: number): number {
  return new Date(anio, mIdx + 1, 0).getDate();
}

export interface FechaNacimiento {
  dia: number;
  mIdx: number; // 0-11
  anio: number;
}

/** Fecha real (no 31 de febrero), de 1900 en adelante y no futura; null si no lo es. */
export function fechaNacimientoValida(dia: string, mes: string, anio: string): FechaNacimiento | null {
  const d = parseInt(dia, 10);
  const mIdx = MESES.indexOf((mes || '').trim().toLowerCase());
  const y = parseInt(anio, 10);
  if (!Number.isInteger(d) || !Number.isInteger(y) || mIdx < 0) return null;
  if (String(anio).trim().length !== 4 || y < ANIO_MINIMO) return null;
  if (d < 1 || d > diasDelMes(mIdx, y)) return null;
  if (new Date(y, mIdx, d).getTime() > Date.now()) return null;
  return { dia: d, mIdx, anio: y };
}

/**
 * "15 de marzo de 1998" (formato con el que se guarda) o "15/03/1998" (como lo
 * capturaban las fichas antiguas) -> partes; todo vacío si no tiene ninguno.
 */
export function parsearFechaNacimiento(texto: string): { dia: string; mes: string; anio: string } {
  const t = (texto || '').trim();
  const largo = t.match(/^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/i);
  if (largo) return { dia: largo[1], mes: largo[2].toLowerCase(), anio: largo[3] };
  const corto = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (corto && MESES[parseInt(corto[2], 10) - 1]) {
    return { dia: corto[1], mes: MESES[parseInt(corto[2], 10) - 1], anio: corto[3] };
  }
  return { dia: '', mes: '', anio: '' };
}

export function formatearFechaNacimiento(dia: string, mes: string, anio: string): string {
  return dia && mes && anio ? `${parseInt(dia, 10)} de ${mes.toLowerCase()} de ${anio}` : '';
}

export function calcularEdad(dia: string, mes: string, anio: string): number | null {
  const f = fechaNacimientoValida(dia, mes, anio);
  if (!f) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - f.anio;
  const diffMes = hoy.getMonth() - f.mIdx;
  if (diffMes < 0 || (diffMes === 0 && hoy.getDate() < f.dia)) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}

/* ------------------------------------------------------------------ */
/* Sexo y entidad                                                      */
/* ------------------------------------------------------------------ */

export function letraSexoCurp(sexo: string): 'H' | 'M' | null {
  const s = (sexo || '').trim().toLowerCase();
  if (s.startsWith('masc') || s === 'h') return 'H';
  if (s.startsWith('fem') || s === 'm') return 'M';
  return null;
}

/** Claves de entidad federativa de la CURP (Instructivo Normativo RENAPO). */
const ENTIDADES_CURP: Record<string, string> = {
  AGUASCALIENTES: 'AS',
  'BAJA CALIFORNIA': 'BC',
  'BAJA CALIFORNIA SUR': 'BS',
  CAMPECHE: 'CC',
  COAHUILA: 'CL',
  'COAHUILA DE ZARAGOZA': 'CL',
  COLIMA: 'CM',
  CHIAPAS: 'CS',
  CHIHUAHUA: 'CH',
  'CIUDAD DE MEXICO': 'DF',
  'DISTRITO FEDERAL': 'DF',
  CDMX: 'DF',
  DF: 'DF',
  DURANGO: 'DG',
  GUANAJUATO: 'GT',
  GUERRERO: 'GR',
  HIDALGO: 'HG',
  JALISCO: 'JC',
  MEXICO: 'MC',
  'ESTADO DE MEXICO': 'MC',
  EDOMEX: 'MC',
  'EDO MEX': 'MC',
  MICHOACAN: 'MN',
  'MICHOACAN DE OCAMPO': 'MN',
  MORELOS: 'MS',
  NAYARIT: 'NT',
  'NUEVO LEON': 'NL',
  OAXACA: 'OC',
  PUEBLA: 'PL',
  QUERETARO: 'QT',
  'QUERETARO DE ARTEAGA': 'QT',
  'QUINTANA ROO': 'QR',
  'SAN LUIS POTOSI': 'SP',
  SINALOA: 'SL',
  SONORA: 'SR',
  TABASCO: 'TC',
  TAMAULIPAS: 'TS',
  TLAXCALA: 'TL',
  VERACRUZ: 'VZ',
  'VERACRUZ DE IGNACIO DE LA LLAVE': 'VZ',
  YUCATAN: 'YN',
  ZACATECAS: 'ZS',
  'NACIDO EN EL EXTRANJERO': 'NE',
  EXTRANJERO: 'NE',
};

export const LUGAR_EXTRANJERO = 'Nacido en el extranjero';

/** Opciones del campo "Lugar de nacimiento": las 32 entidades más el caso de nacidos fuera del país. */
export const LUGARES_NACIMIENTO = [...ESTADOS_MEXICO, LUGAR_EXTRANJERO];

export function codigoEntidadCurp(lugar: string): string | null {
  return ENTIDADES_CURP[limpiar(lugar)] || null;
}

/** Nombre de la entidad (en el catálogo de LUGARES_NACIMIENTO) para una clave de CURP. */
const LUGAR_POR_CLAVE: Record<string, string> = (() => {
  const mapa: Record<string, string> = {};
  for (const lugar of LUGARES_NACIMIENTO) {
    const clave = codigoEntidadCurp(lugar);
    if (clave) mapa[clave] = lugar;
  }
  return mapa;
})();

/* ------------------------------------------------------------------ */
/* Letras de nombre y apellidos                                        */
/* ------------------------------------------------------------------ */

const VOCALES = 'AEIOU';

/** Palabras que el algoritmo oficial ignora al tomar letras de un apellido o nombre compuesto. */
const PARTICULAS = new Set([
  'DA', 'DAS', 'DE', 'DEL', 'DER', 'DI', 'DIE', 'DD', 'EL', 'LA', 'LOS', 'LAS', 'LE', 'LES', 'MAC', 'MC', 'VAN', 'VON', 'Y',
]);

/** Primera palabra significativa: "DE LA CRUZ" -> "CRUZ", "PEREZ GIL" -> "PEREZ". */
function primeraPalabra(texto: string): string {
  const palabras = limpiar(texto).split(' ').filter(Boolean);
  return palabras.find((p) => !PARTICULAS.has(p)) || palabras[0] || '';
}

/** "MARIA"/"JOSE" (y sus abreviaturas MA./J.) como primer nombre se ignoran a favor del siguiente. */
function nombreParaClave(nombres: string): string {
  const palabras = limpiar(nombres).split(' ').filter(Boolean);
  const utiles = palabras.filter((p) => !PARTICULAS.has(p));
  const lista = utiles.length ? utiles : palabras;
  if (lista.length > 1 && ['MARIA', 'JOSE', 'MA', 'J'].includes(lista[0])) return lista[1];
  return lista[0] || '';
}

function primeraVocalInterna(palabra: string): string {
  for (let i = 1; i < palabra.length; i++) if (VOCALES.includes(palabra[i])) return palabra[i];
  return 'X';
}

/** Primera consonante después de la inicial; en la CURP la Ñ se sustituye por X. */
function primeraConsonanteInterna(palabra: string): string {
  for (let i = 1; i < palabra.length; i++) {
    const c = palabra[i];
    if (/[A-ZÑ]/.test(c) && !VOCALES.includes(c)) return c === 'Ñ' ? 'X' : c;
  }
  return 'X';
}

const sinEnie = (c: string) => (c === 'Ñ' ? 'X' : c);

/** Palabras inconvenientes del Instructivo Normativo de la CURP (RENAPO). */
const INCONVENIENTES_CURP = new Set([
  'BACA', 'BAKA', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO',
  'COLA', 'CULO', 'FALO', 'FETO', 'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA', 'KAKO', 'KOGE',
  'KOGI', 'KOJA', 'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO', 'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS',
  'MEON', 'MIAR', 'MION', 'MOCO', 'MOKO', 'MULA', 'MULO', 'NACA', 'NACO', 'PEDA', 'PEDO', 'PENE', 'PIPI', 'PITO', 'POPO', 'PUTA',
  'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN', 'SENO', 'TETA', 'VACA', 'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI',
  'WUEY',
]);

/** Palabras inconvenientes de la clave del RFC (SAT). */
const INCONVENIENTES_RFC = new Set([
  'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO', 'COGE', 'COJA', 'COJE', 'COJI', 'COJO', 'CULO', 'FETO', 'GUEY',
  'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA', 'KOGE', 'KOJO', 'KULO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MION', 'MOCO',
  'MULA', 'PEDA', 'PEDO', 'PENE', 'PUTA', 'PUTO', 'QULO', 'RATA', 'RUIN',
]);

/* ------------------------------------------------------------------ */
/* Datos de entrada                                                    */
/* ------------------------------------------------------------------ */

export interface DatosPersona {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  dia: string;
  mes: string; // nombre del mes en español, minúsculas (como en MESES)
  anio: string;
  sexo?: string; // 'Masculino' | 'Femenino'
  lugarNacimiento?: string; // entidad federativa de nacimiento (o "Nacido en el extranjero")
}

export type CampoIdentidad = 'nombre(s)' | 'primer apellido' | 'fecha de nacimiento' | 'sexo' | 'lugar de nacimiento';

/**
 * Qué falta capturar para poder calcular las claves. `curp` pide además sexo y
 * lugar de nacimiento; el RFC solo necesita nombre y fecha.
 */
export function datosFaltantes(d: DatosPersona, clave: 'curp' | 'rfc'): CampoIdentidad[] {
  const faltan: CampoIdentidad[] = [];
  if (!limpiar(d.nombres)) faltan.push('nombre(s)');
  if (!limpiar(d.apellidoPaterno) && !limpiar(d.apellidoMaterno)) faltan.push('primer apellido');
  if (!fechaNacimientoValida(d.dia, d.mes, d.anio)) faltan.push('fecha de nacimiento');
  if (clave === 'curp') {
    if (!letraSexoCurp(d.sexo || '')) faltan.push('sexo');
    if (!codigoEntidadCurp(d.lugarNacimiento || '')) faltan.push('lugar de nacimiento');
  }
  return faltan;
}

interface Partes {
  paterno: string; // primera palabra significativa del primer apellido
  materno: string;
  nombre: string;
  fecha: FechaNacimiento;
}

function prepararPartes(d: DatosPersona): Partes | null {
  const fecha = fechaNacimientoValida(d.dia, d.mes, d.anio);
  const nombre = nombreParaClave(d.nombres || '');
  const paterno = primeraPalabra(d.apellidoPaterno || '');
  const materno = primeraPalabra(d.apellidoMaterno || '');
  if (!fecha || !nombre || (!paterno && !materno)) return null;
  return { paterno, materno, nombre, fecha };
}

function aammdd(f: FechaNacimiento): string {
  return `${String(f.anio).slice(-2)}${String(f.mIdx + 1).padStart(2, '0')}${String(f.dia).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* CURP                                                                */
/* ------------------------------------------------------------------ */

const ALFABETO_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function digitoVerificadorCURP(primeros17: string): string {
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const idx = ALFABETO_CURP.indexOf(primeros17[i]);
    suma += (idx >= 0 ? idx : 0) * (18 - i);
  }
  return String((10 - (suma % 10)) % 10);
}

export function calcularCURP(d: DatosPersona): string | null {
  const p = prepararPartes(d);
  if (!p) return null;
  const letraSexo = letraSexoCurp(d.sexo || '');
  const entidad = codigoEntidadCurp(d.lugarNacimiento || '');
  if (!letraSexo || !entidad) return null;

  let letras = letrasInicialesCURP(p);
  if (INCONVENIENTES_CURP.has(letras)) letras = letras[0] + 'X' + letras.slice(2);

  const c14 = p.paterno ? primeraConsonanteInterna(p.paterno) : 'X';
  const c15 = p.materno ? primeraConsonanteInterna(p.materno) : 'X';
  const c16 = primeraConsonanteInterna(p.nombre);
  const diferenciador = p.fecha.anio >= 2000 ? 'A' : '0';

  const base17 = `${letras}${aammdd(p.fecha)}${letraSexo}${entidad}${c14}${c15}${c16}${diferenciador}`;
  return base17 + digitoVerificadorCURP(base17);
}

/** Primeras cuatro letras de la CURP; sin primer apellido van "XX" y sin segundo apellido una "X". */
function letrasInicialesCURP(p: Partes): string {
  const c1 = p.paterno ? sinEnie(p.paterno[0]) : 'X';
  const c2 = p.paterno ? primeraVocalInterna(p.paterno) : 'X';
  const c3 = p.materno ? sinEnie(p.materno[0]) : 'X';
  const c4 = sinEnie(p.nombre[0]);
  return `${c1}${c2}${c3}${c4}`;
}

const CODIGOS_CURP = Object.values(ENTIDADES_CURP).filter((v, i, a) => a.indexOf(v) === i).join('|');
const REGEX_CURP = new RegExp(
  `^[A-Z][AEIOUX][A-Z]{2}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])[HMX](${CODIGOS_CURP})[B-DF-HJ-NP-TV-ZX]{3}[0-9A-Z]\\d$`
);

export type ResultadoValidacion = { ok: true } | { ok: false; motivo: string };

/** Forma de la CURP (18 posiciones, fecha real, entidad válida) y su dígito verificador. */
export function validarCURP(curp: string): ResultadoValidacion {
  const c = (curp || '').trim().toUpperCase();
  if (c.length !== 18) return { ok: false, motivo: `La CURP debe tener 18 caracteres (lleva ${c.length}).` };
  if (!REGEX_CURP.test(c)) return { ok: false, motivo: 'El formato no corresponde a una CURP (revisa letras, fecha, sexo y entidad).' };
  const mIdx = parseInt(c.slice(6, 8), 10) - 1;
  const dia = parseInt(c.slice(8, 10), 10);
  const anio = (/\d/.test(c[16]) ? 1900 : 2000) + parseInt(c.slice(4, 6), 10);
  if (dia > diasDelMes(mIdx, anio)) return { ok: false, motivo: 'La fecha de nacimiento de la CURP no existe.' };
  if (digitoVerificadorCURP(c.slice(0, 17)) !== c[17]) {
    return { ok: false, motivo: 'El dígito verificador no coincide: probablemente hay un error de captura.' };
  }
  return { ok: true };
}

export interface DatosDeCURP {
  dia: string;
  mes: string;
  anio: string;
  sexo: 'Masculino' | 'Femenino' | '';
  lugarNacimiento: string;
}

/** Fecha, sexo y entidad que dice una CURP válida (para precargar el resto de la identidad). */
export function desglosarCURP(curp: string): DatosDeCURP | null {
  const c = (curp || '').trim().toUpperCase();
  if (!validarCURP(c).ok) return null;
  const anio = (/\d/.test(c[16]) ? 1900 : 2000) + parseInt(c.slice(4, 6), 10);
  return {
    dia: String(parseInt(c.slice(8, 10), 10)),
    mes: MESES[parseInt(c.slice(6, 8), 10) - 1],
    anio: String(anio),
    sexo: c[10] === 'H' ? 'Masculino' : c[10] === 'M' ? 'Femenino' : '',
    lugarNacimiento: LUGAR_POR_CLAVE[c.slice(11, 13)] || '',
  };
}

/* ------------------------------------------------------------------ */
/* RFC                                                                 */
/* ------------------------------------------------------------------ */

/** Los primeros 10 caracteres: letras + AAMMDD. Es la parte 100% determinista. */
export function calcularClaveRFC(d: DatosPersona): string | null {
  const p = prepararPartes(d);
  if (!p) return null;

  const { paterno, materno, nombre } = p;
  let letras: string;
  if (paterno && materno) {
    letras = paterno.length <= 2
      ? `${paterno[0]}${materno[0]}${nombre[0]}${nombre[1] || 'X'}`
      : `${paterno[0]}${primeraVocalInterna(paterno)}${materno[0]}${nombre[0]}`;
  } else {
    const apellido = paterno || materno;
    letras = `${apellido[0]}${apellido[1] || 'X'}${nombre[0]}${nombre[1] || 'X'}`;
  }
  if (INCONVENIENTES_RFC.has(letras)) letras = letras.slice(0, 3) + 'X';

  return `${letras}${aammdd(p.fecha)}`;
}

// Tabla 1 del algoritmo del SAT: valor de cada carácter del nombre completo.
const VALOR_NOMBRE: Record<string, string> = {
  ' ': '00', '&': '10',
  A: '11', B: '12', C: '13', D: '14', E: '15', F: '16', G: '17', H: '18', I: '19', J: '21', K: '22', L: '23', M: '24',
  N: '25', O: '26', P: '27', Q: '28', R: '29', S: '32', T: '33', U: '34', V: '35', W: '36', X: '37', Y: '38', Z: '39', Ñ: '40',
};
// Tabla 2: carácter de la homoclave para cada cociente/residuo (0-33).
const CARACTER_HOMOCLAVE = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
// Tabla 3: valor de cada carácter del RFC para el dígito verificador.
const VALOR_VERIFICADOR = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';

/** Homoclave (2 caracteres) con el algoritmo público de homonimia del SAT. */
export function homoclaveRFC(d: DatosPersona): string | null {
  if (!prepararPartes(d)) return null;
  const nombreCompleto = [limpiar(d.apellidoPaterno), limpiar(d.apellidoMaterno), limpiar(d.nombres)].join(' ').trim();

  let numerico = '0';
  for (const ch of nombreCompleto) numerico += VALOR_NOMBRE[ch] ?? '00';

  let suma = 0;
  for (let i = 0; i < numerico.length - 1; i++) {
    suma += parseInt(numerico.slice(i, i + 2), 10) * parseInt(numerico[i + 1], 10);
  }
  const resto = suma % 1000;
  return CARACTER_HOMOCLAVE[Math.floor(resto / 34)] + CARACTER_HOMOCLAVE[resto % 34];
}

/** Dígito verificador (posición 13) de los 12 primeros caracteres del RFC. */
export function digitoVerificadorRFC(primeros12: string): string {
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const idx = VALOR_VERIFICADOR.indexOf(primeros12[i] ?? ' ');
    suma += (idx >= 0 ? idx : 0) * (13 - i);
  }
  const resultado = 11 - (suma % 11);
  if (resultado === 11) return '0';
  if (resultado === 10) return 'A';
  return String(resultado);
}

/** RFC completo (13 posiciones) con homoclave y dígito verificador estimados. */
export function calcularRFC(d: DatosPersona): string | null {
  const base = calcularClaveRFC(d);
  const homoclave = homoclaveRFC(d);
  if (!base || !homoclave) return null;
  const doce = base + homoclave;
  return doce + digitoVerificadorRFC(doce);
}

const REGEX_RFC = /^[A-ZÑ&]{4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;

/** Persona física (13 posiciones): forma, fecha real y dígito verificador. */
export function validarRFC(rfc: string): ResultadoValidacion {
  const r = (rfc || '').trim().toUpperCase();
  if (r.length === 10) {
    return { ok: false, motivo: 'Al RFC le falta la homoclave (3 caracteres): captúrala de la Constancia de Situación Fiscal.' };
  }
  if (r.length !== 13) return { ok: false, motivo: `El RFC de persona física debe tener 13 caracteres (lleva ${r.length}).` };
  if (!REGEX_RFC.test(r)) return { ok: false, motivo: 'El formato no corresponde a un RFC (4 letras, fecha de 6 dígitos y homoclave).' };
  if (digitoVerificadorRFC(r.slice(0, 12)) !== r[12]) {
    return { ok: false, motivo: 'El dígito verificador no coincide: probablemente hay un error de captura.' };
  }
  return { ok: true };
}

/** NSS del IMSS: 11 dígitos. */
export function validarNSS(nss: string): ResultadoValidacion {
  const n = (nss || '').replace(/\s|-/g, '');
  if (!/^\d+$/.test(n)) return { ok: false, motivo: 'El NSS solo lleva dígitos.' };
  if (n.length !== 11) return { ok: false, motivo: `El NSS debe tener 11 dígitos (lleva ${n.length}).` };
  return { ok: true };
}
