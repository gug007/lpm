const IMAGE_TOKEN = /\[Image #\d+\]/g;

// Pasting an image leaves this placeholder in the transcript's opening prompt.
// It's plumbing, not something a person wrote.
export function cleanPrompt(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  const stripped = text.replace(IMAGE_TOKEN, " ").replace(/\s+/g, " ").trim();
  if (stripped) return stripped;
  return text ? "Image prompt" : "";
}
