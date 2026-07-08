import { NextRequest } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const key = req.headers.get('x-setup-key');
    if (key !== process.env.JWT_SECRET) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const logPath = process.env.SQLITE_DB_PATH
      ? path.join(path.dirname(process.env.SQLITE_DB_PATH), 'webhook_logs.txt')
      : path.join(process.cwd(), 'db', 'webhook_logs.txt');

    if (!existsSync(logPath)) {
      return Response.json({ message: 'No hay logs de webhook registrados aún.' });
    }

    const logs = readFileSync(logPath, 'utf8');
    return new Response(logs, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
