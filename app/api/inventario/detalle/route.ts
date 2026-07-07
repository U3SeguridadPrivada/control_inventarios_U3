import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { calcularInventarioDetalle } from '@/src/lib/inventario';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(calcularInventarioDetalle());
}
