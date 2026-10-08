import { createHash, randomUUID } from 'crypto';
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { AuthUser, verifyAuth } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { InventarioError, validarFecha } from '@/src/lib/inventarioValidacion';
import { puedeAccionModulo, PermisoModulo } from '@/src/lib/permisosModulos';

export function autorizarInventario(req: NextRequest, modulo: string | string[], accion: keyof PermisoModulo = 'crear'): AuthUser {
  const user = verifyAuth(req);
  if (!user) throw new InventarioError('No autorizado', 401);
  const acceso = accesoDeUsuario(user.id);
  if (!(Array.isArray(modulo) ? modulo : [modulo]).some(m => puedeAccionModulo(m, accion, acceso))) throw new InventarioError('Sin permisos para esta operación', 403);
  return user;
}

/** Lecturas auxiliares necesarias para capturar, sin conceder edición del catálogo. */
export function autorizarConsultaInventario(req: NextRequest, permisos: [string, keyof PermisoModulo][]) {
  const user = verifyAuth(req);
  if (!user) throw new InventarioError('No autorizado', 401);
  const acceso = accesoDeUsuario(user.id);
  if (!permisos.some(([modulo, accion]) => puedeAccionModulo(modulo, accion, acceso))) throw new InventarioError('Sin permisos para esta consulta', 403);
  return user;
}

/** La validación de existencias y la escritura comparten un bloqueo de escritura. */
export function operarInventario<T>(req: NextRequest, user: AuthUser, payload: any, fecha: string, motivo: string, ejecutar: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], operacionId: string) => T): T {
  validarFecha(fecha);
  const clave = req.headers.get('Idempotency-Key');
  if (!clave || !/^[a-zA-Z0-9_-]{16,100}$/.test(clave)) throw new InventarioError('Falta la clave de operación; vuelve a abrir el formulario');
  const hash = createHash('sha256').update(JSON.stringify({ ruta: req.nextUrl.pathname, motivo, payload })).digest('hex');
  return db.transaction(tx => {
    const previa = tx.get<{ usuario_id: number; hash: string; respuesta: string }>(sql`SELECT * FROM inventario_solicitudes WHERE clave=${clave}`);
    if (previa) {
      if (previa.usuario_id !== user.id || previa.hash !== hash) throw new InventarioError('Esta clave de operación ya se utilizó con otros datos', 409);
      return JSON.parse(previa.respuesta) as T;
    }
    const operacionId = randomUUID();
    tx.run(sql`UPDATE inventario_contexto SET usuario=${user.username}, fecha=${fecha}, operacion_id=${operacionId}, motivo=${motivo} WHERE id=1`);
    const resultado = ejecutar(tx, operacionId);
    tx.run(sql`INSERT INTO inventario_solicitudes(clave,usuario_id,hash,respuesta) VALUES(${clave},${user.id},${hash},${JSON.stringify(resultado)})`);
    tx.run(sql`UPDATE inventario_contexto SET usuario=NULL,fecha=NULL,operacion_id=NULL,motivo=NULL WHERE id=1`);
    return resultado;
  }, { behavior: 'immediate' });
}
