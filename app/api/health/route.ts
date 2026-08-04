import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { db } from '@/src/db';
import { users, candidatos, guardias } from '@/src/db/schema';
import { sql } from 'drizzle-orm';

/**
 * GET /api/health
 * Estado de la persistencia. Existe porque la app llegó a correr semanas contra
 * disco efímero sin que nada lo delatara: el sitio respondía 200 mientras cada
 * reinicio borraba la base. No expone rutas ni datos, solo si la configuración
 * es correcta y cuánto se guardó.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const avisos: string[] = [];

  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
  const enProduccion = process.env.NODE_ENV === 'production';

  if (!process.env.SQLITE_DB_PATH) {
    avisos.push('SQLITE_DB_PATH no está definida: la base usa la ruta por defecto.');
  }
  const dentroDeLaApp = path
    .resolve(dbPath)
    .replace(/\\/g, '/')
    .startsWith(path.resolve(process.cwd()).replace(/\\/g, '/'));
  if (dentroDeLaApp && enProduccion) {
    avisos.push('La base vive dentro del directorio de la aplicación: NO sobrevive a un reinicio.');
  }
  if (!existsSync(dbPath)) {
    avisos.push('El archivo de base de datos aún no existe.');
  }

  // Respaldos: sin ellos el volumen es un punto único de fallo
  const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
  let respaldos = 0;
  let ultimoRespaldo: string | null = null;
  if (existsSync(backupDir)) {
    const archivos = readdirSync(backupDir)
      .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
      .map((f) => statSync(path.join(backupDir, f)))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    respaldos = archivos.length;
    ultimoRespaldo = archivos[0]?.mtime.toISOString() ?? null;
  }
  if (respaldos === 0) avisos.push('No hay ningún respaldo generado.');

  let conteos: Record<string, number> | null = null;
  let errorDb: string | null = null;
  try {
    const contar = (tabla: any) => db.select({ n: sql<number>`count(*)` }).from(tabla).get()?.n ?? 0;
    conteos = {
      usuarios: contar(users),
      candidatos: contar(candidatos),
      guardias: contar(guardias),
    };
  } catch (e: any) {
    errorDb = e?.message ?? 'error desconocido';
    avisos.push('No se pudo consultar la base de datos.');
  }

  const estado = errorDb ? 'error' : avisos.length ? 'riesgo' : 'ok';

  return Response.json(
    {
      estado,
      persistente: !dentroDeLaApp && !!process.env.SQLITE_DB_PATH,
      base_existe: existsSync(dbPath),
      respaldos,
      ultimo_respaldo: ultimoRespaldo,
      conteos,
      avisos,
      momento: new Date().toISOString(),
    },
    { status: estado === 'error' ? 503 : 200 }
  );
}
