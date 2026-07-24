// The composer's serialized value — shape, empty seed, and the attachment rule
// that decides which paths are images. Its own module so DOM-free code (e.g.
// jobsFormat) can share them without pulling in the editor's DOM helpers.

// A single attachment: the `[Image #N]` token in the serialized text and the
// local file path it resolves to.
export interface ComposerImage {
  token: number;
  path: string;
}

// Text with inline `[Image #N]` tokens, the token→path map for those tokens, and
// whether an image is still being saved (so the consumer can hold a submit until
// attachments are on disk).
export interface ComposerValue {
  text: string;
  images: ComposerImage[];
  pending: boolean;
}

export const EMPTY_COMPOSER: ComposerValue = {
  text: "",
  images: [],
  pending: false,
};

// A path the composer renders as an image chip (thumbnail + lightbox); every
// other dropped/pasted file becomes a named file chip.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_EXT_RE.test(path);
}

const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

// The composer's value as one plain string: each attachment token replaced in
// place by its absolute path, padded with a space when it would otherwise run
// into neighboring text, so the agent reads the path as its own word. Tokens
// with no path left (their chip was removed) drop out. Newlines stay — the text
// is written as prose, not typed into a terminal line.
export function composerValueToText(value: ComposerValue): string {
  const byToken = new Map(value.images.map((im) => [im.token, im.path]));
  return value.text
    .replace(IMAGE_TOKEN_RE, (match, n: string, offset: number, whole: string) => {
      const path = byToken.get(Number(n));
      if (!path) return "";
      const before = whole[offset - 1];
      const after = whole[offset + match.length];
      const lead = before && !/\s/.test(before) ? " " : "";
      const tail = after && !/\s/.test(after) ? " " : "";
      return `${lead}${path}${tail}`;
    })
    .trim();
}

// An absolute path standing on its own in the prompt text — the shape an
// attachment serializes to, and what parsing turns back into a chip.
const ABS_PATH_RE = /(?<![^\s])\/\S+/g;

// Reverse of composerValueToText: every standalone absolute image path becomes an
// attachment token again, so an edited prompt shows its chips back. Any other
// path stays literal text, and re-serializing reproduces the stored string
// verbatim.
export function textToPrompt(text: string): ComposerValue {
  const images: ComposerImage[] = [];
  const out = text.replace(ABS_PATH_RE, (path) => {
    if (!isImagePath(path)) return path;
    const token = images.length + 1;
    images.push({ token, path });
    return `[Image #${token}]`;
  });
  return { text: out, images, pending: false };
}

// The seed is typed into a terminal as one line then submitted, so newlines
// flatten to spaces.
function flattenSeedText(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// A stored prompt string as terminal-delivery parts. Text-only prompts become
// one flattened line; each standalone image path becomes its own part (raw,
// space-padded, not shell-quoted) so the agent lifts it into an image the same
// way a manual composer send does, instead of it arriving as quoted text.
export function promptTextToSeed(text: string): string | string[] | undefined {
  const parts: string[] = [];
  let last = 0;
  let hasImages = false;
  for (const match of text.matchAll(ABS_PATH_RE)) {
    const path = match[0];
    if (!isImagePath(path)) continue;
    hasImages = true;
    const before = flattenSeedText(text.slice(last, match.index));
    if (before) parts.push(before);
    parts.push(` ${path} `);
    last = match.index + path.length;
  }
  if (!hasImages) return flattenSeedText(text) || undefined;
  const tail = flattenSeedText(text.slice(last));
  if (tail) parts.push(tail);
  return parts.length ? parts : undefined;
}
