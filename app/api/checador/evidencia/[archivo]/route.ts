import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ archivo: string }> }
) {
  if (!verifyAuth(req)) return unauthorized();

  const { archivo } = await params;
  // Prevenir path traversal
  const safeName = path.basename(archivo);
  const filePath = path.join(process.cwd(), 'uploads', 'checador', safeName);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return Response.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}
