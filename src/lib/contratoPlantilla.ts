import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { eq, or, like } from 'drizzle-orm';
import { generarContenidoContrato, aplicarDatosAPlantilla, DatosContrato } from './generadorContrato';
import { ContenidoDoc } from './documentoProtocolo';

/**
 * Contrato final para un guardia: si hay una Plantilla Base guardada (botón
 * "Usar como Plantilla Base" en el editor), reutiliza su composición —
 * estructura, redacción fija, saltos de hoja — y solo sustituye los datos
 * críticos (ámbar) de este guardia; si nadie ha guardado una plantilla
 * todavía, usa el formato estándar tal cual siempre lo hizo.
 *
 * Antes de esto, "Usar como Plantilla Base" guardaba correctamente pero
 * ningún punto de generación de contratos volvía a leer lo guardado: los
 * cambios de composición del usuario nunca llegaban a los contratos nuevos.
 */
export function construirContratoParaGuardia(datos: Partial<DatosContrato>): ContenidoDoc {
  try {
    const plantilla = db.select().from(protocolos)
      .where(or(eq(protocolos.id, 29), like(protocolos.titulo, '%Contrato Individual de Trabajo%')))
      .get();

    const contenidoPlantilla = plantilla?.contenido as ContenidoDoc | null | undefined;
    if (contenidoPlantilla?.secciones?.length) {
      return aplicarDatosAPlantilla(contenidoPlantilla, datos);
    }
  } catch (e) {
    console.warn('No se pudo aplicar la Plantilla Base del contrato, usando el formato estándar:', e);
  }
  return generarContenidoContrato(datos);
}
