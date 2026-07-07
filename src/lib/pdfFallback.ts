/**
 * Generación de PDF 100% en el navegador (html2canvas + jsPDF), usada SOLO como
 * respaldo cuando la generación en el servidor (Puppeteer) falla — por ejemplo, si
 * el contenedor de producción se queda sin memoria. Produce un PDF rasterizado
 * (imagen por página), no texto seleccionable, pero garantiza que el usuario
 * siempre pueda obtener un documento aunque el servidor esté degradado.
 */

const A4_HEIGHT = 1123;

export async function generarPdfFallback(htmlString: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
      position: 'fixed', top: '0', left: '-9999px',
      width: '816px', height: '1056px', border: 'none', opacity: '0', pointerEvents: 'none',
    });
    document.body.appendChild(iframe);
    const cleanup = () => { try { document.body.removeChild(iframe); } catch { /* noop */ } };

    iframe.onload = async () => {
      try {
        await new Promise((r) => setTimeout(r, 800)); // esperar fuentes/imágenes
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');
        const doc = iframe.contentDocument;
        if (!doc) { cleanup(); reject(new Error('No se pudo acceder al iframe')); return; }

        const elementsToCheck = doc.querySelectorAll('table, [style*="page-break-before:always"], [style*="page-break-before: always"], .avoid-break');

        elementsToCheck.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const isPageBreak = el.tagName === 'TABLE' || (el.getAttribute('style') || '').includes('page-break-before');
          const view = doc.defaultView;

          if (isPageBreak) {
            const currentPos = rect.top;
            const pageNumber = Math.floor(currentPos / A4_HEIGHT);
            const nextPagePos = (pageNumber + 1) * A4_HEIGHT + 40;
            const pushAmount = nextPagePos - currentPos;
            if (pushAmount > 0 && currentPos % A4_HEIGHT > 50) {
              const currentMargin = parseFloat(view?.getComputedStyle(el).marginTop || '0');
              (el as HTMLElement).style.marginTop = `${currentMargin + pushAmount}px`;
            }
          } else {
            const topPage = Math.floor(rect.top / A4_HEIGHT);
            const bottomPage = Math.floor(rect.bottom / A4_HEIGHT);
            if (topPage !== bottomPage) {
              const nextPagePos = bottomPage * A4_HEIGHT + 40;
              const pushAmount = nextPagePos - rect.top;
              const currentMargin = parseFloat(view?.getComputedStyle(el).marginTop || '0');
              (el as HTMLElement).style.marginTop = `${currentMargin + pushAmount}px`;
            }
          }
        });

        // Empuja el bloque de firma para que no quede partido entre páginas
        const sigEl = doc.querySelector('.signatures-wrapper, .firma') as HTMLElement | null;
        if (sigEl) {
          const rect = sigEl.getBoundingClientRect();
          const bottomPage = Math.floor(rect.bottom / A4_HEIGHT);
          const targetBottom = (bottomPage + 1) * A4_HEIGHT - 50;
          const pushAmount = targetBottom - rect.bottom;
          if (pushAmount > 0) {
            const currentMargin = parseFloat(doc.defaultView?.getComputedStyle(sigEl).marginTop || '0');
            sigEl.style.marginTop = `${currentMargin + pushAmount}px`;
          }
        }

        const canvas = await html2canvas(doc.documentElement, {
          scale: 4, useCORS: true, allowTaint: true,
          width: 816, windowWidth: 816, logging: false,
        });

        const pdf = new jsPDF({ format: 'letter', unit: 'mm', orientation: 'portrait' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pdfW) / canvas.width;
        const imgData = canvas.toDataURL('image/jpeg', 1.0);

        let y = 0;
        while (y < imgH) {
          if (y > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, -y, pdfW, imgH);
          y += pdfH;
        }

        cleanup();
        resolve(pdf.output('blob'));
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    iframe.onerror = () => { cleanup(); reject(new Error('Error cargando HTML en el iframe')); };
    iframe.srcdoc = htmlString;
  });
}
