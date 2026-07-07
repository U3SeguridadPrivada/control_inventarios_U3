import { existsSync, promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';

const SYSTEM_CHROMIUM_PATHS = [
  process.env.CHROMIUM_PATH,
  '/run/current-system/sw/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function getChromiumExecPath(): Promise<string> {
  for (const p of SYSTEM_CHROMIUM_PATHS) {
    if (p && existsSync(p)) return p;
  }
  const chromium = await import('@sparticuz/chromium');
  return chromium.default.executablePath();
}

// Limpia perfiles huérfanos de Chromium/Puppeteer en el directorio temporal del sistema,
// para que contenedores de larga duración (Railway) no se queden sin disco.
async function cleanOldTmpProfiles() {
  try {
    const tmpDir = os.tmpdir();
    if (!existsSync(tmpDir)) return;
    const files = await fsPromises.readdir(tmpDir);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutos

    for (const file of files) {
      if (file.startsWith('puppeteer_dev_profile-') || file.startsWith('.org.chromium.Chromium.')) {
        const fullPath = path.join(tmpDir, file);
        try {
          const stat = await fsPromises.stat(fullPath);
          if (now - stat.mtimeMs > maxAge) {
            await fsPromises.rm(fullPath, { recursive: true, force: true });
          }
        } catch {
          // Puede que otro proceso ya lo haya limpiado; ignorar.
        }
      }
    }
  } catch {
    // No crítico: si falla la limpieza, no debe tumbar la generación del PDF.
  }
}

// Cola de concurrencia: limita a 1 render de PDF a la vez para no saturar
// CPU/RAM en contenedores pequeños (p. ej. Railway con poca memoria).
let activeRenders = 0;
const renderQueue: (() => void)[] = [];

async function acquireQueueSlot(): Promise<void> {
  if (activeRenders < 1) {
    activeRenders++;
    return;
  }
  return new Promise<void>((resolve) => {
    renderQueue.push(resolve);
  });
}

function releaseQueueSlot(): void {
  activeRenders--;
  if (renderQueue.length > 0) {
    activeRenders++;
    const next = renderQueue.shift();
    if (next) next();
  }
}

export interface HtmlToPdfOptions {
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  /** Encabezado/pie repetidos en cada página (mecanismo nativo de Chromium/Puppeteer). */
  headerTemplate?: string;
  footerTemplate?: string;
}

export async function htmlToPdf(html: string, options?: HtmlToPdfOptions): Promise<Buffer> {
  cleanOldTmpProfiles().catch(() => {});
  await acquireQueueSlot();

  let browser: any = null;
  try {
    const puppeteer = await import('puppeteer-core');
    const executablePath = await getChromiumExecPath();

    browser = await puppeteer.default.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
      ],
    });

    const hasHeaderFooter = !!(options?.headerTemplate || options?.footerTemplate);

    let pdfBuffer: Buffer;
    let page: any = null;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      pdfBuffer = Buffer.from(
        await page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: {
            top: options?.margin?.top ?? '0.4in',
            bottom: options?.margin?.bottom ?? '0.4in',
            left: options?.margin?.left ?? '0.4in',
            right: options?.margin?.right ?? '0.4in',
          },
          displayHeaderFooter: hasHeaderFooter,
          headerTemplate: options?.headerTemplate ?? '<span></span>',
          footerTemplate: options?.footerTemplate ?? '<span></span>',
        })
      );
    } finally {
      if (page) {
        try { await page.close(); } catch { /* noop */ }
      }
    }
    return pdfBuffer;
  } finally {
    if (browser) {
      // Seguro contra cuelgues: si browser.close() tarda demasiado, mata el proceso de raíz.
      const closeTimeout = setTimeout(() => {
        try { browser.process()?.kill('SIGKILL'); } catch { /* noop */ }
      }, 5000);
      try {
        await browser.close();
      } catch {
        try { browser.process()?.kill('SIGKILL'); } catch { /* noop */ }
      } finally {
        clearTimeout(closeTimeout);
      }
    }
    releaseQueueSlot();
  }
}
