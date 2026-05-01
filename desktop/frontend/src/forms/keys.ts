import { slugify } from "../slugify";
import { uniqueKey } from "../uniqueKey";

interface DesiredKeyOptions {
  rawName: string;
  editingName: string | null;
  existingNames: string[];
  fallback: string;
}

/**
 * Resolves the YAML key a slug-based form should write to. In edit mode, the
 * key follows the user's name input but falls back to the original key when
 * empty. In create mode, collisions are resolved with a numeric suffix.
 */
export function computeDesiredKey(opts: DesiredKeyOptions): string {
  const slug = slugify(opts.rawName.trim());
  if (opts.editingName) return slug || opts.editingName;
  return uniqueKey(slug || opts.fallback, opts.existingNames);
}
