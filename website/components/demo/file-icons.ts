// VS Code's Seti file icons, drawn as font glyphs beside a file name — the same
// set the app's Files tab uses (icons by Jesse Weed's seti-ui, MIT; the font and
// its licence live in public/fonts). Trimmed to the file types the demo's
// project trees actually contain.

// glyph, colour against the demo's dark background.
type SetiDef = readonly [glyph: string, color: string];

const DEFS: Record<string, SetiDef> = {
  "_babel": ["\uE006", "#cbcb41"],
  "_config": ["\uE019", "#6d8086"],
  "_css": ["\uE01D", "#519aba"],
  "_csv": ["\uE01E", "#8dc149"],
  "_db": ["\uE022", "#f55385"],
  "_default": ["\uE023", "#d4d7d6"],
  "_docker_3": ["\uE025", "#f55385"],
  "_favicon": ["\uE02F", "#cbcb41"],
  "_git": ["\uE034", "#41535b"],
  "_go2": ["\uE03A", "#519aba"],
  "_gradle": ["\uE03C", "#519aba"],
  "_image": ["\uE04C", "#a074c4"],
  "_info": ["\uE04D", "#519aba"],
  "_javascript": ["\uE051", "#cbcb41"],
  "_json": ["\uE055", "#cbcb41"],
  "_makefile": ["\uE05F", "#e37933"],
  "_markdown": ["\uE060", "#519aba"],
  "_notebook": ["\uE066", "#519aba"],
  "_python": ["\uE07B", "#519aba"],
  "_react": ["\uE07D", "#519aba"],
  "_react_1": ["\uE07D", "#e37933"],
  "_ruby": ["\uE081", "#cc3e44"],
  "_shell": ["\uE089", "#8dc149"],
  "_svg": ["\uE091", "#a074c4"],
  "_swift": ["\uE092", "#e37933"],
  "_tsconfig": ["\uE097", "#519aba"],
  "_typescript": ["\uE099", "#519aba"],
  "_typescript_1": ["\uE099", "#e37933"],
  "_xml": ["\uE0A5", "#e37933"],
  "_yml": ["\uE0A7", "#a074c4"],
};

const BY_EXTENSION: Record<string, string> = {
  "css": "_css",
  "csv": "_csv",
  "go": "_go2",
  "gradle": "_gradle",
  "ico": "_favicon",
  "ipynb": "_notebook",
  "js": "_javascript",
  "json": "_json",
  "mdx": "_markdown",
  "mjs": "_javascript",
  "plist": "_xml",
  "png": "_image",
  "py": "_python",
  "rb": "_ruby",
  "sh": "_shell",
  "sql": "_db",
  "svg": "_svg",
  "swift": "_swift",
  "test.ts": "_typescript_1",
  "test.tsx": "_react_1",
  "toml": "_config",
  "ts": "_typescript",
  "tsx": "_react",
  "xml": "_xml",
  "yaml": "_yml",
  "yml": "_yml",
};

const BY_NAME: Record<string, string> = {
  ".env": "_config",
  ".gitignore": "_git",
  "babel.config.js": "_babel",
  "docker-compose.yml": "_docker_3",
  "makefile": "_makefile",
  "readme.md": "_info",
  "tsconfig.json": "_tsconfig",
};

const DEFAULT = DEFS["_default"];

function idFor(name: string): string | undefined {
  const lower = name.toLowerCase();
  const byName = BY_NAME[lower];
  if (byName) return byName;
  // The longest dotted suffix wins, so "a.test.js" finds "test.js" before "js".
  for (let dot = lower.indexOf("."); dot >= 0; dot = lower.indexOf(".", dot + 1)) {
    const byExtension = BY_EXTENSION[lower.slice(dot + 1)];
    if (byExtension) return byExtension;
  }
  if (lower.startsWith(".env.")) return BY_NAME[".env"];
  return undefined;
}

export function iconForFile(name: string): { glyph: string; color: string } {
  const id = idFor(name);
  const [glyph, color] = (id && DEFS[id]) || DEFAULT;
  return { glyph, color: color || "currentColor" };
}
