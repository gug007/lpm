// Strips CSI/OSC ANSI escape sequences so a serialized terminal line can be
// compared as plain text while its raw (colored) form is kept for rendering.
// Built from char codes to keep raw control bytes out of the source.
const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b);
const BEL = String.fromCharCode(0x07);
const ANSI_PATTERN = new RegExp(
  `[${ESC}${CSI}][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?${BEL})|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))`,
  "g",
);

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

export interface FilterResult {
  lines: string[];
  count: number;
}

// Keeps only the lines whose visible text contains `query` (case-insensitive),
// returning them with ANSI intact so a mirror terminal renders them in color.
export function filterLines(ansiText: string, query: string): FilterResult {
  if (!query) return { lines: [], count: 0 };
  const needle = query.toLowerCase();
  const lines: string[] = [];
  for (const raw of ansiText.split(/\r?\n/)) {
    if (stripAnsi(raw).toLowerCase().includes(needle)) lines.push(raw);
  }
  return { lines, count: lines.length };
}
