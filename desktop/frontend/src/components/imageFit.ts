// Geometry + labels for the image file preview. Pure so the fit math is
// testable without a DOM; the hook and the view own all state.

export interface Size {
  w: number;
  h: number;
}

// Scale at which the image sits fully inside the box. Never upscales: a small
// image shows at its natural size and is centred instead of being blown up.
export function fitScale(natural: Size | null, box: Size | null): number {
  if (!natural || !box) return 1;
  if (natural.w <= 0 || natural.h <= 0 || box.w <= 0 || box.h <= 0) return 1;
  return Math.min(1, box.w / natural.w, box.h / natural.h);
}

export function scaledSize(natural: Size, scale: number): Size {
  return { w: Math.round(natural.w * scale), h: Math.round(natural.h * scale) };
}

// What the zoom control reads: the effective scale, not the multiplier, so
// "100%" means one image pixel per CSS pixel.
export function zoomPercent(fit: number, zoom: number): number {
  return Math.round(fit * zoom * 100);
}

// Decoded byte count of a standard base64 payload, without decoding it.
export function base64ByteLength(data: string): number {
  if (!data) return 0;
  const pad = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - pad);
}

export function formatImageMeta(natural: Size | null, sizeLabel: string): string | null {
  const parts: string[] = [];
  if (natural) parts.push(`${natural.w} × ${natural.h}`);
  if (sizeLabel) parts.push(sizeLabel);
  return parts.length > 0 ? parts.join(" · ") : null;
}
