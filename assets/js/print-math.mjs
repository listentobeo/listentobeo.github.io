// Shared by the browser preview and server preflight. Units are millimetres.
export function fitArtwork(pixelWidth, pixelHeight, widthMm, heightMm, borderMm = 0) {
  if (![pixelWidth, pixelHeight, widthMm, heightMm].every(n => Number.isFinite(n) && n > 0) ||
      !Number.isFinite(borderMm) || borderMm < 0 || 2 * borderMm >= Math.min(widthMm, heightMm)) {
    throw new Error('Invalid artwork or print dimensions.');
  }
  const mmPerPixel = Math.min((widthMm - 2 * borderMm) / pixelWidth, (heightMm - 2 * borderMm) / pixelHeight);
  const width = pixelWidth * mmPerPixel, height = pixelHeight * mmPerPixel;
  return { width, height, x: (widthMm - width) / 2, y: (heightMm - height) / 2, ppi: 25.4 / mmPerPixel };
}
export function printQuality(width, height, variant) {
  const fit = fitArtwork(width, height, variant.width_mm, variant.height_mm, variant.border_mm || 0);
  const minimum = Math.max(150, variant.min_ppi || 150);
  return { ...fit, allowed: fit.ppi + 1e-8 >= minimum, minimum };
}
export function routeCountry(country) {
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('Choose a delivery country.');
  return country === 'NG' ? 'MANUAL_NIGERIA' : 'GELATO';
}
