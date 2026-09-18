// A small tokenizer for the Files tab. The app runs Shiki inside Monaco; the
// demo has neither, and the point here is only that a file reads as code rather
// than as a wall of grey — so this colours comments, strings, numbers and
// keywords, and leaves everything else alone.

export type Token = { text: string; cls: string };

export type Lang = "clike" | "hash" | "json" | "markdown" | "sql" | "plain";

const BY_EXTENSION: Record<string, Lang> = {
  ts: "clike",
  tsx: "clike",
  js: "clike",
  jsx: "clike",
  mjs: "clike",
  cjs: "clike",
  go: "clike",
  swift: "clike",
  gradle: "clike",
  css: "clike",
  astro: "clike",
  py: "hash",
  rb: "hash",
  sh: "hash",
  bash: "hash",
  yml: "hash",
  yaml: "hash",
  toml: "hash",
  gitignore: "hash",
  example: "hash",
  json: "json",
  lock: "json",
  ipynb: "json",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
};

const BY_NAME: Record<string, Lang> = {
  Makefile: "hash",
  Gemfile: "hash",
  Podfile: "hash",
  rails: "hash",
  sidekiq: "hash",
  ".lpm.yml": "hash",
  ".gitignore": "hash",
  ".env.example": "hash",
};

export function langOf(name: string): Lang {
  const byName = BY_NAME[name];
  if (byName) return byName;
  for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
    const byExtension = BY_EXTENSION[name.slice(dot + 1).toLowerCase()];
    if (byExtension) return byExtension;
  }
  return "plain";
}

const COMMENT = "text-[#6a9955]";
const STRING = "text-[#ce9178]";
const KEYWORD = "text-[#569cd6]";
const NUMBER = "text-[#b5cea8]";
const FUNCTION = "text-[#dcdcaa]";
const PROPERTY = "text-[#9cdcfe]";
const HEADING = "text-[#569cd6] font-semibold";
const PLAIN = "";

const CLIKE_WORDS =
  "import|export|from|default|const|let|var|function|func|return|if|else|for|while|switch|case|break|continue|type|interface|class|extends|implements|new|await|async|package|struct|range|defer|go|map|chan|nil|null|undefined|true|false|this|super|public|private|static|enum|throw|try|catch|finally|as|in|of|typeof|instanceof|void|readonly";

const HASH_WORDS =
  "def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|lambda|None|True|False|and|or|not|in|is|pass|yield|async|await|self|end|do|module|require|gem|set|echo|fi|then|esac|case|local|export|function";

const SQL_WORDS =
  "SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|CREATE|TABLE|INDEX|ALTER|ADD|COLUMN|DROP|PRIMARY|KEY|NOT|NULL|DEFAULT|REFERENCES|UNIQUE|IF|EXISTS|BEGIN|COMMIT|ON|AND|OR|uuid|text|timestamptz|boolean|integer";

// Each pattern is one alternative in a single master regex; the matching group
// decides the colour.
const RULES: Record<Lang, { re: RegExp; classes: string[] } | null> = {
  clike: {
    re: new RegExp(
      [
        "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)",
        "(`(?:[^`\\\\]|\\\\.)*`|\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*')",
        `\\b(?:${CLIKE_WORDS})\\b`,
        "\\b(\\d[\\d_.]*)\\b",
        "\\b([A-Za-z_$][\\w$]*)(?=\\()",
      ]
        .map((part, i) => (i === 2 ? `(${part})` : part))
        .join("|"),
      "g",
    ),
    classes: [COMMENT, STRING, KEYWORD, NUMBER, FUNCTION],
  },
  hash: {
    re: new RegExp(
      [
        "(#[^\\n]*)",
        "(\"\"\"[\\s\\S]*?\"\"\"|\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*')",
        `\\b(?:${HASH_WORDS})\\b`,
        "\\b(\\d[\\d_.]*)\\b",
        "^\\s*([\\w.-]+)(?=\\s*:)",
      ]
        .map((part, i) => (i === 2 ? `(${part})` : part))
        .join("|"),
      "gm",
    ),
    classes: [COMMENT, STRING, KEYWORD, NUMBER, PROPERTY],
  },
  json: {
    re: new RegExp(
      ['("(?:[^"\\\\]|\\\\.)*")(?=\\s*:)', '("(?:[^"\\\\]|\\\\.)*")', "\\b(true|false|null)\\b", "(-?\\d[\\d.eE+-]*)"].join(
        "|",
      ),
      "g",
    ),
    classes: [PROPERTY, STRING, KEYWORD, NUMBER],
  },
  sql: {
    re: new RegExp(
      ["(--[^\\n]*)", "('(?:[^'\\\\\\n]|\\\\.)*')", `\\b(${SQL_WORDS})\\b`, "\\b(\\d+)\\b"].join("|"),
      "gi",
    ),
    classes: [COMMENT, STRING, KEYWORD, NUMBER],
  },
  markdown: {
    re: new RegExp(
      [
        "^(#{1,6} [^\\n]*)",
        "(```[\\s\\S]*?```|`[^`\\n]*`)",
        "(^---$)",
        "(\\[[^\\]\\n]*\\]\\([^)\\n]*\\))",
        "(^\\s*[-*] )",
      ].join("|"),
      "gm",
    ),
    classes: [HEADING, STRING, COMMENT, PROPERTY, KEYWORD],
  },
  plain: null,
};

function tokenize(text: string, lang: Lang): Token[] {
  const rule = RULES[lang];
  if (!rule) return [{ text, cls: PLAIN }];
  const out: Token[] = [];
  let last = 0;
  rule.re.lastIndex = 0;
  for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
    // A zero-width match would spin forever.
    if (m.index === rule.re.lastIndex) rule.re.lastIndex += 1;
    const group = rule.classes.findIndex((_, i) => m[i + 1] !== undefined);
    if (group < 0) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: PLAIN });
    out.push({ text: m[group + 1], cls: rule.classes[group] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: PLAIN });
  return out;
}

/** The file's lines, each as coloured spans. */
export function highlight(content: string, lang: Lang): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokenize(content, lang)) {
    const parts = token.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cls: token.cls });
    });
  }
  return lines;
}
