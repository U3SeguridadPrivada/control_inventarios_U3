/**
 * Genera los iconos de la PWA a partir de public/logo_b.png.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * Produce en public/icons/:
 *   - icon-{192,256,384,512}.png   (proposito "any", fondo blanco)
 *   - maskable-{192,512}.png       (proposito "maskable", logo al 55% para la zona segura)
 *   - apple-touch-icon.png         (180x180, sin transparencia)
 *   - favicon-{16,32}.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'public', 'logo_b.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Recorta el area transparente sobrante del logo original. */
async function trimmedLogo() {
  return sharp(SOURCE).trim({ threshold: 10 }).png().toBuffer();
}

/**
 * Dibuja el logo centrado sobre un lienzo de color solido.
 * @param {Buffer} logo
 * @param {number} size lado del icono final
 * @param {number} coverage fraccion del lado que ocupa el logo (0-1)
 * @param {{r:number,g:number,b:number,alpha:number}} background
 */
async function compose(logo, size, coverage, background) {
  const inner = Math.round(size * coverage);
  const resized = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const logo = await trimmedLogo();

  const written = [];
  const emit = async (name, buffer) => {
    await writeFile(path.join(OUT_DIR, name), buffer);
    written.push(`${name} (${(buffer.length / 1024).toFixed(1)} kB)`);
  };

  // Iconos "any": logo azul sobre blanco, con margen de respiro.
  for (const size of [192, 256, 384, 512]) {
    await emit(`icon-${size}.png`, await compose(logo, size, 0.76, WHITE));
  }

  // Maskable: el launcher recorta hasta un 20% por lado, el logo se queda al 55%.
  for (const size of [192, 512]) {
    await emit(`maskable-${size}.png`, await compose(logo, size, 0.55, WHITE));
  }

  // iOS no admite transparencia ni aplica mascara propia.
  await emit('apple-touch-icon.png', await compose(logo, 180, 0.72, WHITE));

  for (const size of [16, 32]) {
    await emit(`favicon-${size}.png`, await compose(logo, size, 0.92, WHITE));
  }

  console.log(`Iconos PWA generados en public/icons:\n  ${written.join('\n  ')}`);
}

main().catch((error) => {
  console.error('No se pudieron generar los iconos:', error);
  process.exit(1);
});
