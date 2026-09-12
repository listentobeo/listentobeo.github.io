import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { Buffer } from 'node:buffer';
import { printQuality } from './print-domain.ts';

export function decodeArtwork(bytes: Uint8Array) {
  if (bytes.length > 15 * 1024 * 1024 || bytes.length < 24) throw new Error('Use a PNG or JPEG under 15 MB.');
  let bitmap: any, mime: string;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) * view.getUint32(20) > 8000000) throw new Error('Artwork exceeds the print processing limit.');
    bitmap = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); mime = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    bitmap = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 8, maxMemoryUsageInMB: 96 }); mime = 'image/jpeg';
  } else throw new Error('Printing requires the original PNG or JPEG artwork. WEBP previews are not print masters.');
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 8000000) throw new Error('Invalid image dimensions.');
  return { ...bitmap, mime };
}
export function renderPrintFile(bytes: Uint8Array, variant: any) {
  const art = decodeArtwork(bytes);
  const fit = printQuality(art.width, art.height, variant);
  if (!fit.allowed) throw new Error('This image does not have enough resolution for that size.');
  const bleed = variant.bleed_mm || 0;
  const pxPerMm = fit.ppi / 25.4;
  const width = Math.ceil((variant.width_mm + bleed * 2) * pxPerMm);
  const height = Math.ceil((variant.height_mm + bleed * 2) * pxPerMm);
  if (width * height > 12000000) throw new Error('Print layout exceeds the processing limit.');
  const output = new PNG({ width, height });
  output.data.fill(255);
  const left = Math.round((fit.x + bleed) * pxPerMm), top = Math.round((fit.y + bleed) * pxPerMm);
  // One source pixel to one output pixel: no upscaling, cropping, filters or AI.
  for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
    const src = (y * art.width + x) * 4, dest = ((y + top) * width + x + left) * 4;
    const alpha = art.data[src + 3] / 255;
    for (let c = 0; c < 3; c++) output.data[dest + c] = Math.round(art.data[src + c] * alpha + 255 * (1 - alpha));
  }
  return { bytes: PNG.sync.write(output), width, height, ppi: fit.ppi };
}
