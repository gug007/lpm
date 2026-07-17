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
