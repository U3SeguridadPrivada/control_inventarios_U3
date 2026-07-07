import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { cuentas_bancarias } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(cuentas_bancarias).orderBy(desc(cuentas_bancarias.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { banco, alias, numero_cuenta, tipo, moneda, saldo_actual } = await req.json();
    if (!banco || !alias) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const nueva = db.insert(cuentas_bancarias).values({
      banco, alias, numero_cuenta, tipo: tipo || 'Cheques', moneda: moneda || 'MXN',
      saldo_actual: saldo_actual ? Number(saldo_actual) : 0,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nueva, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear la cuenta bancaria' }, { status: 500 });
  }
}
