const IMAGE_TOKEN = /\[Image #\d+\]/g;

// Pasting an image leaves this placeholder in the transcript's opening prompt.
// It's plumbing, not something a person wrote.
export function cleanPrompt(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  const stripped = text.replace(IMAGE_TOKEN, " ").replace(/\s+/g, " ").trim();
  if (stripped) return stripped;
  return text ? "Image prompt" : "";
}

// Case, punctuation and the truncation ellipsis are the only things that
// separate "Linux host issue" from "linux host issue".
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether a session's opening prompt would just restate its title. Agents name
 * a conversation by rewording its first prompt, so the two often differ only in
 * case or by the ellipsis a long prompt was cut at — and a second line that
 * echoes the first is a wasted line.
 *
 * A shared prefix only counts when the shorter side covers most of the longer
 * one: "Fix login" opening "fix login bug in the auth flow" is a real preview,
 * not an echo.
 */
export function echoesTitle(title: string, preview: string): boolean {
  const a = normalize(title);
  const b = normalize(preview);
  if (!a || !b) return true;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(short) && short.length >= long.length * 0.7;
}
