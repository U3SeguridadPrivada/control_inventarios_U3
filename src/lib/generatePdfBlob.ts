import { generarPdfFallback } from './pdfFallback';

/**
 * Intenta generar el PDF con el endpoint del servidor (Puppeteer, vectorial, rápido).
 * Si falla por cualquier motivo (servidor caído, sin memoria, error 500, etc.),
 * recurre al respaldo 100% en el navegador para que el usuario nunca se quede sin documento.
 */
export async function generarPdfConFallback(fetchPrimario: () => Promise<Response>, htmlParaFallback: string): Promise<{ blob: Blob; viaFallback: boolean }> {
  try {
    const res = await fetchPrimario();
    if (res.ok) {
      return { blob: await res.blob(), viaFallback: false };
    }
    console.warn('[pdf] El servidor respondió con error, usando respaldo del navegador');
  } catch {
    console.warn('[pdf] No se pudo contactar al servidor, usando respaldo del navegador');
  }

  const blob = await generarPdfFallback(htmlParaFallback);
  return { blob, viaFallback: true };
}
