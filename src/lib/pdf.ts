import { existsSync } from 'fs';

const SYSTEM_CHROMIUM_PATHS = [
  process.env.CHROMIUM_PATH,
  '/run/current-system/sw/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function getChromiumExecPath(): Promise<string> {
  for (const p of SYSTEM_CHROMIUM_PATHS) {
    if (p && existsSync(p)) return p;
  }
  const chromium = await import('@sparticuz/chromium');
  return chromium.default.executablePath();
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer-core');
  const executablePath = await getChromiumExecPath();

  const browser = await puppeteer.default.launch({
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

  let pdfBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    pdfBuffer = Buffer.from(
      await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
      })
    );
  } finally {
    const t = setTimeout(() => browser.close().catch(() => {}), 5000);
    await browser.close().finally(() => clearTimeout(t));
  }

  return pdfBuffer;
}
