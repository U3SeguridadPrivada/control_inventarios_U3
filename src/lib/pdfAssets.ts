import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Puppeteer recibe el HTML por `setContent`, sin URL base: logo y tipografía
 * tienen que viajar dentro del documento como data URI. Se leen una sola vez
 * porque no cambian entre reportes. Solo servidor (usa `fs`).
 */
let assetsCache: Promise<{ logoSrc: string; fontSrc: string }> | null = null;

export function assetsDataUri() {
  if (!assetsCache) {
    assetsCache = (async () => {
      const [logo, font] = await Promise.all([
        readFile(path.join(process.cwd(), 'public', 'LOGO_PDFS.png')),
        readFile(path.join(process.cwd(), 'public', 'fonts', 'inter-latin.woff2')),
      ]);
      return {
        logoSrc: `data:image/png;base64,${logo.toString('base64')}`,
        fontSrc: `data:font/woff2;base64,${font.toString('base64')}`,
      };
    })().catch((e) => {
      assetsCache = null; // un fallo puntual de lectura no debe quedar cacheado
      throw e;
    });
  }
  return assetsCache;
}
