import { COMPANY } from '@/src/lib/company';

/** Etapas del embudo, en el orden en que avanza un prospecto. */
export const ETAPAS = ['Nuevo', 'Contactado', 'Interesado', 'Cotizado', 'Ganado', 'Perdido'] as const;
export type Etapa = (typeof ETAPAS)[number];

/** Etapas que ya no requieren seguimiento activo. */
export const ETAPAS_CERRADAS: Etapa[] = ['Ganado', 'Perdido'];

export const COLOR_ETAPA: Record<Etapa, string> = {
  Nuevo: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Contactado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Interesado: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Cotizado: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Ganado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Perdido: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export const COLOR_PRIORIDAD: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  B: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  C: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export const MOTIVOS_PERDIDA = [
  'Ya tiene proveedor',
  'Sin presupuesto',
  'No contesta',
  'Datos incorrectos',
  'No le interesa el servicio',
  'Precio fuera de rango',
  'Otro',
];

export const TIPOS_ACTIVIDAD: Record<string, string> = {
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  nota: 'Nota',
  etapa: 'Cambio de etapa',
  asignacion: 'Asignación',
};

/** Datos que las plantillas pueden interpolar. */
export interface DatosPlantilla {
  empresa: string;
  giro?: string | null;
  alcaldia?: string | null;
  asesor: string;
  telefonoAsesor?: string | null;
}

const COTIZACION_RAMOS = 'escolar, comercial, industrial, restaurantero, residencial y de construcción';

function nombreComercial(d: DatosPlantilla): string {
  return d.empresa || 'su empresa';
}

/**
 * Plantillas de primer contacto. Van en texto plano: el asesor las edita en el
 * panel antes de enviar y el servidor las convierte a HTML con textoAHtml.
 */
export const PLANTILLAS_CORREO = [
  {
    id: 'presentacion',
    nombre: 'Presentación inicial',
    asunto: (d: DatosPlantilla) => `Servicio de seguridad privada para ${nombreComercial(d)}`,
    cuerpo: (d: DatosPlantilla) => `Estimados de ${nombreComercial(d)}:

Le escribo de ${COMPANY.razonSocial}, empresa de seguridad privada con autorización de la Secretaría de Seguridad Ciudadana de la Ciudad de México (Permiso ${COMPANY.permisoDGSPyCI}, Expediente ${COMPANY.expediente}) y registro REPSE ante la STPS.

Prestamos servicios de vigilancia intramuros con personal capacitado y con todas las prestaciones de ley, lo que exime al cliente de cualquier responsabilidad laboral. Atendemos los ramos ${COTIZACION_RAMOS}.

Me gustaría agendar una visita breve a sus instalaciones${d.alcaldia ? ` en ${d.alcaldia}` : ''} para conocer sus necesidades y presentarles una propuesta sin compromiso.

Quedo atento a sus comentarios.`,
  },
  {
    id: 'seguimiento',
    nombre: 'Seguimiento',
    asunto: (d: DatosPlantilla) => `Seguimiento — propuesta de vigilancia para ${nombreComercial(d)}`,
    cuerpo: (d: DatosPlantilla) => `Estimados de ${nombreComercial(d)}:

Doy seguimiento al correo que les envié sobre nuestros servicios de seguridad privada. ¿Tuvieron oportunidad de revisarlo?

Con gusto agendamos una llamada de diez minutos para explicarles cómo trabajamos y qué costo tendría el servicio en su caso concreto.

Quedo a sus órdenes.`,
  },
  {
    id: 'cotizacion',
    nombre: 'Invitación a cotizar',
    asunto: (d: DatosPlantilla) => `Propuesta económica de vigilancia — ${nombreComercial(d)}`,
    cuerpo: (d: DatosPlantilla) => `Estimados de ${nombreComercial(d)}:

Para elaborar su propuesta económica solo necesito tres datos:

• Número de puestos de vigilancia que requieren.
• Horario de cobertura (12 o 24 horas, días de la semana).
• Domicilio del inmueble a resguardar.

Con esa información les hago llegar la cotización formal el mismo día.`,
  },
];

/**
 * Convierte el texto que escribió el asesor en HTML seguro para el correo:
 * escapa todo y respeta los saltos de línea. Nada de lo tecleado se interpreta
 * como marcado.
 */
export function textoAHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escapado
    .split(/\n{2,}/)
    .map((parrafo) => `<p>${parrafo.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

/**
 * Plantillas de WhatsApp. Van en texto plano y cortas: es el canal donde un
 * mensaje largo se ignora.
 */
export const PLANTILLAS_WHATSAPP = [
  {
    id: 'presentacion',
    nombre: 'Presentación inicial',
    cuerpo: (d: DatosPlantilla) => `Buen día. Le escribo de ${COMPANY.razonSocial}, empresa de seguridad privada autorizada por la Secretaría de Seguridad Ciudadana de la CDMX (Permiso ${COMPANY.permisoDGSPyCI}).

Ofrecemos vigilancia intramuros con personal capacitado y todas las prestaciones de ley. ¿Con quién puedo tratar el tema de seguridad en ${nombreComercial(d)}?

${d.asesor}${d.telefonoAsesor ? ` · ${d.telefonoAsesor}` : ''}
${COMPANY.telefono}`,
  },
  {
    id: 'seguimiento',
    nombre: 'Seguimiento',
    cuerpo: (d: DatosPlantilla) => `Buen día. Doy seguimiento a mi mensaje anterior sobre el servicio de vigilancia para ${nombreComercial(d)}. ¿Le interesa que le mandemos una propuesta sin compromiso?

${d.asesor} · ${COMPANY.razonSocial}`,
  },
  {
    id: 'cita',
    nombre: 'Agendar visita',
    cuerpo: (d: DatosPlantilla) => `Buen día. ¿Tendría disponibilidad esta semana para una visita breve a sus instalaciones? Con eso podemos dimensionar el servicio y entregarle una cotización el mismo día.

${d.asesor} · ${COMPANY.razonSocial}`,
  },
];

/** Normaliza a los 10 dígitos nacionales y antepone 52 para la API de WhatsApp. */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  const digitos = (telefono || '').replace(/\D/g, '');
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('52')) return digitos;
  if (digitos.length === 13 && digitos.startsWith('521')) return `52${digitos.slice(3)}`;
  return null;
}
