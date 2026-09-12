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

// Preview-only geometry: match the original ratio; never invent a purchasable SKU.
export function previewVariant(width, height) {
  const mmPerPixel=Math.min(203.2/Math.max(width,height),25.4/150);
  return {width_mm:width*mmPerPixel,height_mm:height*mmPerPixel,frame_style:'none',border_mm:0,min_ppi:150};
}
export function preferredVariant(width,height,variants) {
  return variants.filter(v=>printQuality(width,height,v).allowed).sort((a,b)=>{
    const mismatch=v=>Math.abs(Math.log((v.width_mm/v.height_mm)/(width/height)));
    return mismatch(a)-mismatch(b)||(b.width_mm*b.height_mm-a.width_mm*a.height_mm);
  })[0];
}
export function previewZoom(width,height,mode='detail') {
  return mode==='full'?1:Math.max(1,Math.min(6,650/width,440/height));
}
