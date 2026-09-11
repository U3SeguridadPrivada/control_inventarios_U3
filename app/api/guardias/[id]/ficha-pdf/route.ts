import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { guardias, candidatos, guardia_documentos } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateFichaTecnicaHtml, FichaTecnicaData } from '@/src/lib/fichaTecnicaHtml';
import { desglosarDireccion } from '@/src/lib/fichaTecnicaUtils';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  if (!guardia) return Response.json({ error: 'Guardia no encontrado' }, { status: 404 });

  // Buscar si tiene fotografía subida en sus documentos del expediente
  let fotoBase64: string | null = null;
  const docs = db.select().from(guardia_documentos).where(eq(guardia_documentos.guardia_id, guardiaId)).all();
  const fotoDoc = docs.find((d) => d.tipo_mimetype.startsWith('image/'));
  if (fotoDoc) {
    try {
      const filePathGuardias = path.join(process.cwd(), 'uploads', 'guardias', fotoDoc.nombre_archivo);
      const filePathRoot = path.join(process.cwd(), 'uploads', fotoDoc.nombre_archivo);
      const targetPath = fs.existsSync(filePathGuardias) ? filePathGuardias : filePathRoot;
      if (fs.existsSync(targetPath)) {
        const buf = fs.readFileSync(targetPath);
        fotoBase64 = `data:${fotoDoc.tipo_mimetype};base64,${buf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('No se pudo cargar la foto del expediente:', e);
    }
  }

  let data: FichaTecnicaData;

  // Si ya tiene ficha técnica guardada en la base de datos, usarla directamente
  if (guardia.ficha_tecnica_json) {
    try {
      data = JSON.parse(guardia.ficha_tecnica_json);
      if (!data.fotoUrl && fotoBase64) {
        data.fotoUrl = fotoBase64;
      }
      if (!data.nombre) {
        data.nombre = guardia.nombre;
      }
      if (!data.numeroElemento) {
        data.numeroElemento = guardia.numero_elemento;
      }
      if (!data.colonia && !data.delegacionMunicipio && data.calleNumero && (data.calleNumero.includes(';') || /,\s*col/i.test(data.calleNumero))) {
        const desglose = desglosarDireccion(data.calleNumero);
        data.calleNumero = desglose.calleNumero;
        data.colonia = desglose.colonia;
        data.delegacionMunicipio = desglose.delegacionMunicipio;
        data.estado = desglose.estado;
        data.cp = desglose.cp;
      }
    } catch {
      data = construirFichaInicial(guardia, fotoBase64);
    }
  } else {
    data = construirFichaInicial(guardia, fotoBase64);
  }

  const isInline = req.nextUrl.searchParams.get('inline') === 'true';
  const forceFresh = req.nextUrl.searchParams.get('fresh') === 'true';
  const cachedFilePath = path.join(process.cwd(), 'uploads', 'guardias', `${guardiaId}-ficha-tecnica.pdf`);

  if (!forceFresh && fs.existsSync(cachedFilePath)) {
    try {
      const stats = fs.statSync(cachedFilePath);
      if (stats.size > 1000) {
        const cachedBuf = fs.readFileSync(cachedFilePath);
        return new Response(new Uint8Array(cachedBuf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="ficha_${guardia.numero_elemento}.pdf"`,
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          },
        });
      }
    } catch (e) {
      console.warn('No se pudo leer PDF cacheado, regenerando...', e);
    }
  }

  const html = generateFichaTecnicaHtml(data);
  const pdfBuffer = await htmlToPdf(html, {
    margin: { top: '8mm', bottom: '8mm', left: '10mm', right: '10mm' },
  });

  // Guardar en cache para próximas lecturas instantáneas
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'guardias');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(cachedFilePath, Buffer.from(pdfBuffer));
  } catch (e) {
    console.warn('No se pudo guardar PDF en caché:', e);
  }

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="ficha_${guardia.numero_elemento}.pdf"`,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

function construirFichaInicial(guardia: any, fotoBase64: string | null): FichaTecnicaData {
  const cand = db.select().from(candidatos).where(eq(candidatos.guardia_id, guardia.id)).get();
  const desglose = desglosarDireccion(guardia.direccion);
  return {
    numeroElemento: guardia.numero_elemento,
    nombre: guardia.nombre,
    puesto: 'GUARDIA DE SEGURIDAD',
    fotoUrl: fotoBase64,
    fechaNacimiento: '',
    edad: cand?.edad ? `${cand.edad} AÑOS` : '',
    lugarNacimiento: cand?.ciudad || 'MÉXICO',
    nacionalidad: 'MEXICANA',
    estadoCivil: 'SOLTERO',
    estudios: 'SECUNDARIA',
    rfc: '',
    curp: '',
    imss: '',
    sexo: 'MASCULINO',
    estatura: '',
    peso: '',
    calleNumero: desglose.calleNumero,
    colonia: desglose.colonia,
    entreCalles: '',
    cp: desglose.cp,
    delegacionMunicipio: desglose.delegacionMunicipio,
    estado: desglose.estado,
    tiempoResidencia: '',
    tiempoRadicarEstado: '',
    telefonoEmergencia: '',
    celular: guardia.telefono || cand?.telefono || '',
    empleos: [
      { empresa: '', periodo: '', puesto: 'GUARDIA DE SEGURIDAD' },
      { empresa: '', periodo: '', puesto: '' },
    ],
  };
}
