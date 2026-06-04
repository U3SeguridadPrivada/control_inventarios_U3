import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { bajas } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  const result = db.select().from(bajas).orderBy(desc(bajas.fecha)).all();
  return Response.json(result);
}
