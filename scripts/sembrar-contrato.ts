import Database from 'better-sqlite3';
import path from 'path';
import { generarContenidoContrato, DATOS_CONTRATO_DEFAULT } from '../src/lib/generadorContrato';

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
const db = new Database(dbPath);

console.log('Sembrando Plantilla Base del Contrato Laboral U3 en:', dbPath);

const contenidoDoc = generarContenidoContrato(DATOS_CONTRATO_DEFAULT);
const jsonStr = JSON.stringify(contenidoDoc);

const titulo = 'Contrato Individual de Trabajo - Tiempo Indeterminado (Periodo de Prueba)';
const categoria = 'Recursos Humanos';
const descripcion = 'Contrato oficial individual de trabajo por tiempo indeterminado sujeto a periodo de prueba conforme al artículo 39-A de la Ley Federal del Trabajo. Copia idéntica del original sin portada ni índice, editable en 5 hojas oficiales.';
const prioridad = 'Alta';

// Actualizar o crear Protocolo Maestro #26
const existente = db.prepare(`
  SELECT id, titulo FROM protocolos 
  WHERE titulo LIKE '%Contrato Individual de Trabajo%' OR titulo LIKE '%Contrato Laboral%'
  ORDER BY id ASC
  LIMIT 1
`).get() as { id: number; titulo: string } | undefined;

if (existente) {
  console.log(`Actualizando plantilla maestra ID ${existente.id}...`);
  db.prepare(`
    UPDATE protocolos
    SET titulo = ?, categoria = ?, descripcion = ?, tipo = 'documento', pasos = '[]', contenido = ?, prioridad = ?, actualizado_en = datetime('now')
    WHERE id = ?
  `).run(titulo, categoria, descripcion, jsonStr, prioridad, existente.id);
  console.log(`Plantilla maestra ID ${existente.id} actualizada.`);
} else {
  const info = db.prepare(`
    INSERT INTO protocolos (titulo, categoria, descripcion, tipo, pasos, contenido, prioridad, activo, creado_por, actualizado_en, created_at)
    VALUES (?, ?, ?, 'documento', '[]', ?, ?, 1, NULL, datetime('now'), datetime('now'))
  `).run(titulo, categoria, descripcion, jsonStr, prioridad);
  console.log(`Plantilla creada con ID: ${info.lastInsertRowid}`);
}

// También actualizar el protocolo 27 (generado para Norberto Romero Granados si existe)
const prot27 = db.prepare(`SELECT id, titulo FROM protocolos WHERE id = 27`).get() as { id: number; titulo: string } | undefined;
if (prot27) {
  console.log('Actualizando protocolo 27...');
  // Generar contrato para Norberto Romero Granados (guardia 3)
  const guardia3 = db.prepare(`SELECT * FROM guardias WHERE id = 3`).get() as any;
  let datosNorberto = { ...DATOS_CONTRATO_DEFAULT };
  if (guardia3) {
    let ficha: any = {};
    try { ficha = JSON.parse(guardia3.ficha_tecnica_json || '{}'); } catch {}
    datosNorberto = {
      ...datosNorberto,
      nombreTrabajador: (guardia3.nombre || 'NORBERTO ROMERO GRANADOS').toUpperCase(),
      puesto: (ficha.puesto || 'TÉCNICO EN SEGURIDAD PRIVADA').toUpperCase(),
      rfcTrabajador: (ficha.rfc || 'ROGN900101XXX').toUpperCase(),
      curpTrabajador: (ficha.curp || 'ROGN900101HDFRRN01').toUpperCase(),
      edad: ficha.edad ? `${ficha.edad} AÑOS` : '35 AÑOS',
      domicilioTrabajador: guardia3.direccion || datosNorberto.domicilioTrabajador,
    };
  }
  const cont27 = generarContenidoContrato(datosNorberto);
  db.prepare(`
    UPDATE protocolos
    SET contenido = ?, actualizado_en = datetime('now')
    WHERE id = 27
  `).run(JSON.stringify(cont27));
  console.log('Protocolo 27 actualizado con contenido idéntico sin portada ni índice.');
}

console.log('Finalizado con éxito.');
