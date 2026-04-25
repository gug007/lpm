// slugify lower-cases and collapses non-alphanumerics to hyphens. Used
// for project names and branch names. Set allowSlash to keep "/" as a
// path separator (e.g. branch names like "feat/foo").
export function slugify(s: string, options: { allowSlash?: boolean } = {}): string {
  const charClass = options.allowSlash ? "a-z0-9/_.-" : "a-z0-9_.-";
  return s
    .trim()
    .toLowerCase()
    .replace(new RegExp(`[^${charClass}]+`, "g"), "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
