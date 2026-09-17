export interface LanguageSpec {
  id: string;
  extensions?: string[];
  filenames?: string[];
}

// The language id Monaco itself would infer for a URI with this path: an exact
// filename wins (Dockerfile, Makefile), else the longest registered extension
// (".d.ts" over ".ts" when both exist). Plain text when nothing claims it.
export function languageForPath(path: string, languages: LanguageSpec[]): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  let best: { id: string; length: number } | null = null;
  for (const lang of languages) {
    if (lang.filenames?.some((f) => f.toLowerCase() === name)) return lang.id;
    for (const ext of lang.extensions ?? []) {
      const e = ext.toLowerCase();
      if (name.length > e.length && name.endsWith(e) && (!best || e.length > best.length)) {
        best = { id: lang.id, length: e.length };
      }
    }
  }
  return best?.id ?? "plaintext";
}
