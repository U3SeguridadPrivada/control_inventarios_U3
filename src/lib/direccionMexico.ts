export const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Homologa el nombre de estado que devuelven APIs externas (p.ej. "Distrito Federal") al catálogo oficial usado en el formulario. */
export function normalizarNombreEstado(nombreLibre: string): string {
  const norm = sinAcentos(nombreLibre);
  if (norm === 'DISTRITO FEDERAL' || norm === 'CDMX' || norm === 'DF') return 'Ciudad de México';
  if (norm === 'EDOMEX' || norm === 'ESTADO DE MEXICO') return 'México';
  const match = ESTADOS_MEXICO.find((e) => sinAcentos(e) === norm);
  return match || nombreLibre;
}
