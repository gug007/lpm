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

export function getLang(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.split(".").pop() ?? "";
  return EXT_LANG[ext] ?? "";
}

let hlPromise: Promise<Highlighter> | null = null;

export function getHL(): Promise<Highlighter> {
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

export async function ensureLang(lang: string): Promise<boolean> {
  const hl = await getHL();
  if (hl.getLoadedLanguages().includes(lang)) return true;
  try {
    await hl.loadLanguage(lang as BundledLanguage);
    return true;
  } catch {
    return false;
  }
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
