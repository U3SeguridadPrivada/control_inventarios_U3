import { ContenidoDoc } from './documentoProtocolo';

/**
 * Versión de la plantilla del PDF del contrato. Igual que en la ficha
 * técnica: el PDF se cachea en disco por guardia y esa caché no distingue
 * cambios de diseño en este archivo — si se edita el HTML/CSS de aquí hay
 * que subir este número para que la caché vieja quede huérfana y el
 * siguiente PDF se regenere con el diseño nuevo.
 */
export const CONTRATO_TEMPLATE_VERSION = 'v5';

/**
 * Genera el HTML autocontenido del Contrato Individual de Trabajo, listo
 * para convertirse a PDF.
 *
 * Calca milimétricamente las 5 hojas de las imágenes originales:
 * - Hoja tamaño Carta estándar (8.5 x 11 pulgadas a 96dpi = 816 x 1056px).
 * - Sin encabezado superior (el texto arranca tras el margen superior).
 * - Pie de página centrado ("Hoja: 1", "Hoja: 2", ..., "Hoja: 5") fijo al fondo.
 * - Tipografía Arial 13px / 1.42 de interlineado, sangrías de 28px y negritas exactas.
 */
export function generateContratoHtml(contenido: ContenidoDoc): string {
  const bloques = contenido.secciones[0]?.bloques ?? [];

  const hojas: string[] = [];
  let actual: string[] = [];
  for (const b of bloques) {
    if (b.tipo === 'salto') {
      hojas.push(actual.join('\n'));
      actual = [];
      continue;
    }
    if ('texto' in b) {
      actual.push(`<div class="bloque">${b.texto}</div>`);
    }
  }
  hojas.push(actual.join('\n'));

  const hojasHtml = hojas
    .map(
      (contenidoHoja, i) => `
    <section class="hoja">
      <div class="hoja-cuerpo">
        ${contenidoHoja}
      </div>
      <div class="hoja-numero">Hoja: ${i + 1}</div>
    </section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Contrato Individual de Trabajo</title>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #000000;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .hoja {
    position: relative;
    width: 816px;
    height: 1056px;
    max-height: 1056px;
    padding: 48px 76px 52px 76px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    page-break-after: always;
    box-sizing: border-box;
    overflow: hidden;
  }
  .hoja:last-child { page-break-after: auto; }
  .hoja-cuerpo {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .hoja-numero {
    position: absolute;
    bottom: 22px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    color: #64748b;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    pointer-events: none;
  }
  .bloque {
    font-size: 13px;
    line-height: 1.42;
    text-align: justify;
    margin: 4px 0;
    color: #000000;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    page-break-inside: avoid;
  }
  .bloque p { margin: 0; line-height: inherit; }
  .bloque table { border-collapse: collapse; }
  strong { font-weight: 700; }
  .sangria { text-indent: 28px; }
  /* Los datos críticos se resaltan en ámbar solo en pantalla para revisión;
     en el PDF siempre se integran como texto normal del documento. */
  .dato-critico {
    background: transparent !important;
    color: inherit !important;
    border: none !important;
    border-bottom: none !important;
    padding: 0 !important;
    margin: 0 !important;
    font-weight: inherit !important;
    box-shadow: none !important;
    text-decoration: none !important;
    display: inline !important;
  }
</style>
</head>
<body>
${hojasHtml}
</body>
</html>`;
}
