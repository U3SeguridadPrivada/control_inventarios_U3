import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { generarContenidoContrato, extraerDatosDeGuardia, DATOS_CONTRATO_DEFAULT } from '../src/lib/generadorContrato';

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
const db = new Database(dbPath);

console.log('Sembrando y actualizando Plantilla Base del Contrato Laboral U3 en:', dbPath);

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

// Actualizar todos los contratos de trabajo existentes en guardia_documentos
const contratosGuardias = db.prepare(`
  SELECT id, guardia_id FROM guardia_documentos 
  WHERE nombre_documento = 'Contrato de Trabajo'
`).all() as { id: number; guardia_id: number }[];

console.log(`Actualizando ${contratosGuardias.length} contratos en guardia_documentos...`);

for (const cd of contratosGuardias) {
  const guardia = db.prepare(`SELECT * FROM guardias WHERE id = ?`).get(cd.guardia_id) as any;
  if (!guardia) continue;
  const datos = { ...DATOS_CONTRATO_DEFAULT, ...extraerDatosDeGuardia(guardia) };
  const cont = generarContenidoContrato(datos);
  db.prepare(`
    UPDATE guardia_documentos
    SET contenido_json = ?, fecha_subida = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(cont), cd.id);
  console.log(`Contrato de guardia ID ${guardia.id} (${guardia.nombre}) actualizado.`);
}

// Limpiar archivos PDF cacheados
const uploadsDir = path.join(process.cwd(), 'uploads', 'guardias');
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  for (const f of files) {
    if (f.includes('contrato') && f.endsWith('.pdf')) {
      try {
        fs.unlinkSync(path.join(uploadsDir, f));
        console.log(`Eliminada caché vieja: ${f}`);
      } catch (e) {
        console.warn(`No se pudo eliminar ${f}:`, e);
      }
    }
  }
}

console.log('Sembrado y actualización finalizados con éxito.');
