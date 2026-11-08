import { mapVisibleText, stripAnsi } from "./filterLines";

// Two lines fold into one that's harder to read than the two.
const MIN_RUN = 3;

const CLOCK = String.raw`\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?`;
const DATE_TIME = String.raw`\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?`;
// A timestamp is one value. A digit inside a word or version (`file2`, `v1.2`)
// is part of the text, and two lines differing there aren't repeats.
const VALUE = new RegExp(String.raw`(?<![\w.])(?:${DATE_TIME}|${CLOCK}|\d+(?:\.\d+)?)`, "g");

export interface FoldRow {
  text: string;
  // What a click on the row's last `cells` columns folds or unfolds.
  toggle?: { key: string; cells: number };
}

interface ParsedLine {
  raw: string;
  template: string;
  values: string[];
}

function parse(raw: string): ParsedLine {
  const values: string[] = [];
  const template = stripAnsi(raw).replace(VALUE, (value) => {
    values.push(value);
    return "\0";
  });
  return { raw, template, values };
}

const isTime = (value: string) => value.includes(":");

// One value's place across the run: what it always was, its range, or for a
// timestamp the latest, which keeps changing as the run grows.
function slotText(values: string[]): string {
  const [first] = values;
  if (values.every((value) => value === first)) return first;
  if (isTime(first)) return values[values.length - 1];
  let low = first;
  let high = first;
  for (const value of values) {
    if (Number(value) < Number(low)) low = value;
    if (Number(value) > Number(high)) high = value;
  }
  return `${low}–${high}`;
}

function foldedText(run: ParsedLine[]): string {
  const slots = run[0].values.map((_, i) => slotText(run.map((line) => line.values[i])));
  let slot = 0;
  return mapVisibleText(run[0].raw, (text) => text.replace(VALUE, (value) => slots[slot++] ?? value));
}

// Both leave colour alone, so whatever follows the row keeps its style.
const faint = (text: string) => `\x1b[2m${text}\x1b[22m`;
const pill = (text: string) => `\x1b[7m${text}\x1b[27m`;

function foldRun(run: ParsedLine[], key: string, expanded: ReadonlySet<string>): FoldRow[] {
  if (expanded.has(key)) {
    const head = `▾ ${run.length} similar lines`;
    return [{ text: faint(head), toggle: { key, cells: head.length } }, ...run.map((line) => ({ text: line.raw }))];
  }
  const mark = ` ×${run.length} `;
  return [{ text: `${foldedText(run)} ${pill(mark)}`, toggle: { key, cells: mark.length } }];
}

// Runs of neighbouring lines that differ only in their numbers, each as one row
// with a count and the range of those numbers; `expanded` holds the keys of runs
// to show in full. A key survives the run growing and new output below it.
export function foldRepeats(lines: readonly string[], expanded: ReadonlySet<string>): FoldRow[] {
  const parsed = lines.map(parse);
  const rows: FoldRow[] = [];
  const runsOf = new Map<string, number>();
  for (let start = 0; start < parsed.length; ) {
    const { template } = parsed[start];
    let end = start + 1;
    if (template.trim()) {
      while (end < parsed.length && parsed[end].template === template) end++;
    }
    const run = parsed.slice(start, end);
    if (run.length < MIN_RUN) {
      rows.push(...run.map((line) => ({ text: line.raw })));
    } else {
      const nth = runsOf.get(template) ?? 0;
      runsOf.set(template, nth + 1);
      rows.push(...foldRun(run, `${nth}\0${template}`, expanded));
    }
    start = end;
  }
  return rows;
}
