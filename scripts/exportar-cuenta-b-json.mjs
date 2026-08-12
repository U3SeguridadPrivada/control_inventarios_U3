import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'db', 'app.db');
const db = new Database(dbPath);

const rows = db.prepare(`
  SELECT fecha, tipo, categoria, monto, descripcion, libro, medio_pago, nombre, tipo_detalle, turno, alimentos, servicio
  FROM movimientos_financieros
  WHERE libro = 'B'
  ORDER BY fecha ASC, id ASC
`).all();

console.log(`[export] Encontrados ${rows.length} movimientos de Cuenta B en la base local.`);

const outputPath = path.join(process.cwd(), 'src', 'data', 'movimientos-cuenta-b.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf8');

console.log(`[export] Archivo JSON creado en ${outputPath} con ${rows.length} registros.`);
db.close();
