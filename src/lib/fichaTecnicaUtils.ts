/** Llaves de la ficha básica (datos personales + domicilio) que capturan tanto el alta rápida como los modales de edición de Personal Administrativo. */
export const CAMPOS_FICHA_BASICA = [
  'fechaNacimiento', 'edad', 'estadoCivil', 'estudios', 'rfc', 'curp', 'imss', 'sexo', 'estatura', 'peso',
  'calleNumero', 'colonia', 'entreCalles', 'cp', 'delegacionMunicipio', 'estado', 'tiempoResidencia',
  'tiempoRadicarEstado', 'telefonoEmergencia', 'celular',
] as const;

export interface EmpleoAnterior {
  empresa: string;
  periodo: string;
  puesto: string;
}

export interface FichaTecnicaData {
  numeroElemento?: string;
  nombre: string;
  fotoUrl?: string | null;
  puesto?: string;
  // Datos Personales
  fechaNacimiento?: string;
  edad?: string;
  lugarNacimiento?: string;
  nacionalidad?: string;
  estadoCivil?: string;
  estudios?: string;
  rfc?: string;
  curp?: string;
  imss?: string;
  sexo?: string;
  estatura?: string;
  peso?: string;
  // Domicilio
  calleNumero?: string;
  colonia?: string;
  entreCalles?: string;
  cp?: string;
  delegacionMunicipio?: string;
  estado?: string;
  tiempoResidencia?: string;
  tiempoRadicarEstado?: string;
  telefonoEmergencia?: string;
  celular?: string;
  // Antecedentes Laborales
  empleos?: EmpleoAnterior[];
  // Pie
  fechaDocumento?: string;
}

export interface DesgloseDireccion {
  calleNumero: string;
  colonia: string;
  delegacionMunicipio: string;
  estado: string;
  cp: string;
}

/**
 * Desglosa de forma inteligente una cadena de dirección almacenada en guardias.direccion
 * para que cada campo (calle y número, colonia, delegación/municipio, estado, cp)
 * se asigne al casillero correspondiente de la Ficha Técnica sin truncarse ni encimarse.
 */
export function desglosarDireccion(direccion?: string | null): DesgloseDireccion {
  const res: DesgloseDireccion = {
    calleNumero: '',
    colonia: '',
    delegacionMunicipio: '',
    estado: 'ESTADO DE MÉXICO',
    cp: '',
  };

  if (!direccion || !direccion.trim()) return res;

  let raw = direccion.trim();

  // 1. Extraer código postal si viene especificado
  const cpMatch = raw.match(/(?:C\.?P\.?|CÓDIGO\s+POSTAL|CP)[:\s]*(\d{5})/i);
  if (cpMatch) {
    res.cp = cpMatch[1];
    raw = raw.replace(cpMatch[0], '').trim();
  } else {
    // Buscar 5 dígitos aislados al final o precedidos de coma
    const cincoDigitos = raw.match(/(?:^|[,\s;])(\d{5})(?:[,\s;]|$)/);
    if (cincoDigitos) {
      res.cp = cincoDigitos[1];
      raw = raw.replace(cincoDigitos[0], ' ').trim();
    }
  }

  // 2. Determinar estado por palabras clave
  const textoLower = raw.toLowerCase();
  if (
    textoLower.includes('cdmx') ||
    textoLower.includes('ciudad de méxico') ||
    textoLower.includes('ciudad de mexico') ||
    textoLower.includes('d.f.') ||
    textoLower.includes('df') ||
    textoLower.includes('iztapalapa') ||
    textoLower.includes('gustavo a. madero') ||
    textoLower.includes('cuauhtémoc') ||
    textoLower.includes('cuauhtemoc') ||
    textoLower.includes('benito juárez') ||
    textoLower.includes('benito juarez') ||
    textoLower.includes('coyoacán') ||
    textoLower.includes('coyoacan') ||
    textoLower.includes('miguel hidalgo') ||
    textoLower.includes('alvaro obregón') ||
    textoLower.includes('venustiano carranza') ||
    textoLower.includes('azcapotzalco') ||
    textoLower.includes('tláhuac') ||
    textoLower.includes('tlalpan') ||
    textoLower.includes('xochimilco')
  ) {
    res.estado = 'CIUDAD DE MÉXICO';
  } else if (
    textoLower.includes('méxico') ||
    textoLower.includes('mexico') ||
    textoLower.includes('edomex') ||
    textoLower.includes('edo mex') ||
    textoLower.includes('nezahualcóyotl') ||
    textoLower.includes('nezahualcoyotl') ||
    textoLower.includes('neza') ||
    textoLower.includes('ecatepec') ||
    textoLower.includes('naucalpan') ||
    textoLower.includes('tlalnepantla') ||
    textoLower.includes('chimalhuacán') ||
    textoLower.includes('chimalhuacan') ||
    textoLower.includes('cuautitlán') ||
    textoLower.includes('toluca') ||
    textoLower.includes('chalco') ||
    textoLower.includes('valle de chalco') ||
    textoLower.includes('tecamac') ||
    textoLower.includes('los reyes') ||
    textoLower.includes('la paz') ||
    textoLower.includes('ixtapaluca')
  ) {
    res.estado = 'ESTADO DE MÉXICO';
  }

  // 3. Dividir por separadores principales (; o , Col. o ,)
  if (raw.includes(';')) {
    const partes = raw.split(';').map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 1) res.calleNumero = partes[0];
    if (partes.length >= 2) {
      res.colonia = partes[1].replace(/^(?:colonia|col\.?)\s+/i, '').trim();
    }
    if (partes.length >= 3) {
      res.delegacionMunicipio = partes[2].replace(/^(?:delegación|del\.?|municipio|mun\.?)\s+/i, '').trim();
    }
    if (partes.length >= 4) {
      res.estado = partes[3].trim();
    }
  } else if (/,\s*col\.?\s*/i.test(raw)) {
    const partes = raw.split(/,\s*col\.?\s*/i);
    res.calleNumero = partes[0].trim();
    if (partes[1]) {
      const restoPartes = partes[1].split(',').map((p) => p.trim()).filter(Boolean);
      if (restoPartes.length >= 1) res.colonia = restoPartes[0];
      if (restoPartes.length >= 2) res.delegacionMunicipio = restoPartes[1];
      if (restoPartes.length >= 3) res.estado = restoPartes[2];
    }
  } else if (raw.includes(',')) {
    const partes = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length === 2) {
      res.calleNumero = partes[0];
      res.delegacionMunicipio = partes[1];
    } else if (partes.length >= 3) {
      res.calleNumero = partes[0];
      res.colonia = partes[1].replace(/^(?:colonia|col\.?)\s+/i, '').trim();
      res.delegacionMunicipio = partes[2].replace(/^(?:delegación|del\.?|municipio|mun\.?)\s+/i, '').trim();
      if (partes.length >= 4) res.estado = partes[3].trim();
    } else {
      res.calleNumero = raw;
    }
  } else {
    res.calleNumero = raw;
  }

  return {
    calleNumero: res.calleNumero.toUpperCase(),
    colonia: res.colonia.toUpperCase(),
    delegacionMunicipio: res.delegacionMunicipio.toUpperCase(),
    estado: res.estado.toUpperCase(),
    cp: res.cp.toUpperCase(),
  };
}

/**
 * Reconstruye una dirección completa legible para guardar en la tabla guardias
 */
export function reconstruirDireccion(data: {
  calleNumero?: string;
  colonia?: string;
  delegacionMunicipio?: string;
  estado?: string;
  cp?: string;
}): string {
  const partes: string[] = [];
  if (data.calleNumero?.trim()) partes.push(data.calleNumero.trim());
  if (data.colonia?.trim()) partes.push(`Col. ${data.colonia.trim()}`);
  if (data.delegacionMunicipio?.trim()) partes.push(data.delegacionMunicipio.trim());
  if (data.estado?.trim()) partes.push(data.estado.trim());
  if (data.cp?.trim()) partes.push(`C.P. ${data.cp.trim()}`);
  return partes.join('; ');
}
