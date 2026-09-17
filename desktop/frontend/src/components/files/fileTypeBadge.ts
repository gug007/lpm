// The little type badge next to a file name, standing in for an icon theme:
// a short label in the language's colour. Unknown types get no badge and fall
// back to the generic file glyph.

export interface FileTypeBadge {
  label: string;
  tone: string;
}

const BY_EXTENSION: Record<string, FileTypeBadge> = {
  ts: { label: "TS", tone: "blue" },
  mts: { label: "TS", tone: "blue" },
  cts: { label: "TS", tone: "blue" },
  tsx: { label: "TSX", tone: "blue" },
  js: { label: "JS", tone: "yellow" },
  mjs: { label: "JS", tone: "yellow" },
  cjs: { label: "JS", tone: "yellow" },
  jsx: { label: "JSX", tone: "yellow" },
  json: { label: "JSON", tone: "amber" },
  jsonc: { label: "JSON", tone: "amber" },
  json5: { label: "JSON", tone: "amber" },
  md: { label: "MD", tone: "indigo" },
  mdx: { label: "MDX", tone: "indigo" },
  css: { label: "CSS", tone: "sky" },
  scss: { label: "SCSS", tone: "purple" },
  sass: { label: "SASS", tone: "purple" },
  less: { label: "LESS", tone: "purple" },
  html: { label: "HTML", tone: "orange" },
  htm: { label: "HTML", tone: "orange" },
  vue: { label: "VUE", tone: "green" },
  svelte: { label: "SVLT", tone: "orange" },
  rs: { label: "RS", tone: "orange" },
  go: { label: "GO", tone: "cyan" },
  py: { label: "PY", tone: "blue" },
  rb: { label: "RB", tone: "red" },
  swift: { label: "SWFT", tone: "orange" },
  kt: { label: "KT", tone: "purple" },
  kts: { label: "KT", tone: "purple" },
  java: { label: "JAVA", tone: "red" },
  c: { label: "C", tone: "slate" },
  h: { label: "H", tone: "slate" },
  cpp: { label: "CPP", tone: "slate" },
  cc: { label: "CPP", tone: "slate" },
  hpp: { label: "HPP", tone: "slate" },
  cs: { label: "C#", tone: "purple" },
  php: { label: "PHP", tone: "indigo" },
  sh: { label: "SH", tone: "green" },
  bash: { label: "SH", tone: "green" },
  zsh: { label: "SH", tone: "green" },
  fish: { label: "SH", tone: "green" },
  sql: { label: "SQL", tone: "teal" },
  yml: { label: "YAML", tone: "rose" },
  yaml: { label: "YAML", tone: "rose" },
  toml: { label: "TOML", tone: "stone" },
  xml: { label: "XML", tone: "orange" },
  plist: { label: "XML", tone: "orange" },
  svg: { label: "SVG", tone: "fuchsia" },
  png: { label: "IMG", tone: "fuchsia" },
  jpg: { label: "IMG", tone: "fuchsia" },
  jpeg: { label: "IMG", tone: "fuchsia" },
  gif: { label: "IMG", tone: "fuchsia" },
  webp: { label: "IMG", tone: "fuchsia" },
  avif: { label: "IMG", tone: "fuchsia" },
  ico: { label: "IMG", tone: "fuchsia" },
  mp4: { label: "VID", tone: "fuchsia" },
  mov: { label: "VID", tone: "fuchsia" },
  webm: { label: "VID", tone: "fuchsia" },
  graphql: { label: "GQL", tone: "pink" },
  gql: { label: "GQL", tone: "pink" },
  env: { label: "ENV", tone: "lime" },
  lock: { label: "LOCK", tone: "gray" },
  txt: { label: "TXT", tone: "gray" },
  log: { label: "LOG", tone: "gray" },
  csv: { label: "CSV", tone: "teal" },
  pdf: { label: "PDF", tone: "red" },
  zip: { label: "ZIP", tone: "gray" },
  gz: { label: "GZ", tone: "gray" },
  wasm: { label: "WASM", tone: "violet" },
};

const BY_NAME: Record<string, FileTypeBadge> = {
  dockerfile: { label: "DOCK", tone: "sky" },
  makefile: { label: "MAKE", tone: "gray" },
  ".gitignore": { label: "GIT", tone: "orange" },
  ".gitattributes": { label: "GIT", tone: "orange" },
  ".gitmodules": { label: "GIT", tone: "orange" },
  ".env": { label: "ENV", tone: "lime" },
  ".npmrc": { label: "NPM", tone: "red" },
  ".nvmrc": { label: "NODE", tone: "green" },
  license: { label: "LIC", tone: "gray" },
};

export function badgeForFile(name: string): FileTypeBadge | null {
  const lower = name.toLowerCase();
  const named = BY_NAME[lower];
  if (named) return named;
  if (lower.startsWith(".env.")) return BY_NAME[".env"];
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXTENSION[lower.slice(dot + 1)] ?? null;
}
