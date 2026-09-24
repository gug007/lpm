// A prompt as a one-line label: image chips dropped, whitespace collapsed.
export function promptPreview(text: string, max = 80): string {
  const plain = text.replace(/\[Image #\d+\]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "Image";
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
