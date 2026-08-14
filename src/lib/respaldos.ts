import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Respaldos semanales automáticos.
 *
 * El volumen de Railway sobrevive a los redeploys, pero eso solo protege contra
 * reinicios: no contra un borrado accidental ni contra perder el volumen. Un
 * respaldo periódico es lo único que cubre esos dos casos.
 *
 * Se dispara desde la app y no desde un cron de la plataforma para que quede
 * funcionando sin configurar nada fuera del repo. La contra es que si el
 * servicio está caído no se respalda — por eso el margen es de días y no de
 * horas: basta con que la app levante una vez en la semana.
 *
 * No reimplementa el respaldo: lanza `scripts/respaldar-db.mjs`, que ya hace
 * VACUUM INTO (copiar el archivo en caliente puede capturarlo a medio escribir),
 * comprueba que el resultado abra y tenga filas antes de rotar, y conserva los
 * últimos BACKUP_KEEP. Tener una sola implementación evita que las dos se
 * separen con el tiempo.
 */

const DIAS_ENTRE_RESPALDOS = 7;
const CADA_CUANTO_REVISAR_MS = 12 * 60 * 60 * 1000; // 12 h
const MS_POR_DIA = 24 * 60 * 60 * 1000;

let yaProgramado = false;

function directorioRespaldos(): string {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'db', 'app.db');
  return process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
}

/** Momento del respaldo más reciente, o `null` si todavía no hay ninguno. */
function ultimoRespaldo(): number | null {
  const dir = directorioRespaldos();
  if (!existsSync(dir)) return null;
  const tiempos = readdirSync(dir)
    .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
    .map((f) => statSync(path.join(dir, f)).mtimeMs);
  return tiempos.length ? Math.max(...tiempos) : null;
}

function respaldar(): void {
  const script = path.join(process.cwd(), 'scripts', 'respaldar-db.mjs');
  if (!existsSync(script)) {
    console.error(`[respaldos] No encuentro ${script}; no se pudo respaldar.`);
    return;
  }
  // Desacoplado del proceso de la app: un respaldo lento no debe frenar peticiones.
  const hijo = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hijo.stdout.on('data', (d) => process.stdout.write(`[respaldos] ${d}`));
  hijo.stderr.on('data', (d) => process.stderr.write(`[respaldos] ${d}`));
  hijo.on('error', (e) => console.error('[respaldos] No se pudo lanzar el respaldo:', e.message));
  hijo.on('close', (code) => {
    if (code !== 0) console.error(`[respaldos] El respaldo terminó con código ${code}.`);
  });
}

/** Respalda solo si toca; se puede llamar cuantas veces sea sin acumular copias. */
function revisar(): void {
  try {
    const ultimo = ultimoRespaldo();
    if (ultimo === null) {
      console.log('[respaldos] No hay ningún respaldo todavía: generando el primero.');
      return respaldar();
    }
    const dias = (Date.now() - ultimo) / MS_POR_DIA;
    if (dias >= DIAS_ENTRE_RESPALDOS) {
      console.log(`[respaldos] El último respaldo tiene ${dias.toFixed(1)} días: generando uno nuevo.`);
      return respaldar();
    }
  } catch (e: any) {
    console.error('[respaldos] Error revisando si toca respaldar:', e?.message ?? e);
  }
}

/**
 * Arranca la revisión periódica. Idempotente: solo el primer llamado programa el
 * temporizador, así que puede invocarse desde la inicialización de la base sin
 * preocuparse de cuántas veces se llame.
 */
export function programarRespaldos(): void {
  if (yaProgramado) return;
  // Durante `next build` se recopilan datos de página y no hay nada que respaldar.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.argv.some((a) => a === 'build' || a.endsWith('next-build'))) return;
  // En desarrollo ensuciaría db/backups en cada arranque; se puede forzar con la variable.
  if (process.env.NODE_ENV !== 'production' && process.env.RESPALDO_AUTOMATICO !== '1') return;

  yaProgramado = true;
  revisar();
  const t = setInterval(revisar, CADA_CUANTO_REVISAR_MS);
  // Que un temporizador no mantenga vivo el proceso al apagarse.
  if (typeof t.unref === 'function') t.unref();
  console.log(`[respaldos] Revisión activa: se respalda si el último tiene ${DIAS_ENTRE_RESPALDOS} días o más.`);
}
