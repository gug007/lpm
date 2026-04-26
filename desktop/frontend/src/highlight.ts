import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from "shiki";

export interface Token {
  content: string;
  color?: string;
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  go: "go",
  py: "python",
  rs: "rust",
  rb: "ruby",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "mdx",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  toml: "toml",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

/** Prefixes of unified-diff metadata lines that viewers should skip. */
export const DIFF_META_PREFIXES = [
  "diff --git",
  "index ",
  "new file mode",
  "old mode",
  "new mode",
  "deleted file mode",
  "similarity index",
  "rename from",
  "rename to",
  "--- ",
  "+++ ",
];

export function getLang(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.split(".").pop() ?? "";
  return EXT_LANG[ext] ?? "";
}

let hlPromise: Promise<Highlighter> | null = null;

function getHL(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [],
    });
  }
  return hlPromise;
}

function currentTheme(): "github-dark" | "github-light" {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "github-light"
    : "github-dark";
}

// Shiki's loadLanguage is not safe to call concurrently for the same language;
// the second caller sees "not loaded" before the first finishes registering,
// triggering a duplicate load that can throw. Dedupe in-flight loads.
const langLoads: Map<string, Promise<boolean>> = new Map();

export async function ensureLang(lang: string): Promise<boolean> {
  const hl = await getHL();
  if (hl.getLoadedLanguages().includes(lang)) return true;
  const inflight = langLoads.get(lang);
  if (inflight) return inflight;
  const load = hl
    .loadLanguage(lang as BundledLanguage)
    .then(() => true)
    .catch(() => false)
    .finally(() => langLoads.delete(lang));
  langLoads.set(lang, load);
  return load;
}

export async function tokenizeLines(
  code: string,
  lang: string,
): Promise<Token[][]> {
  const hl = await getHL();
  return hl
    .codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: currentTheme(),
    })
    .tokens.map((line) => line.map((t) => ({ content: t.content, color: t.color })));
}
