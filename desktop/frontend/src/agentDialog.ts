// An agent CLI's choice dialog — a permission prompt, an approval, a question
// form — read off the bottom of its terminal screen, so the sidebar can show it
// and answer it. Claude Code and Codex both draw a numbered list with a marker
// on the selected row, and both take the option's number as the answer.

export interface AgentDialogOption {
  /** The key that picks it: its number. */
  key: string;
  label: string;
  description: string;
  selected: boolean;
  /** Picking it opens a text box in the terminal instead of answering. */
  typed: boolean;
}

export interface AgentDialog {
  question: string;
  /** What the dialog is about — the command, the file, the reason — top first. */
  details: string[];
  options: AgentDialogOption[];
}

const OPTION = /^(\s*)([❯›>▶]\s*)?(\d{1,2})\.\s+(\S.*?)\s*$/;
const SOLID_RULE = /^\s*[─━═]{20,}\s*$/;
const ANY_RULE = /^\s*[─━═╌┄┈┅╍-]{8,}\s*$/;
const TRANSCRIPT_LINE = /^\s*[•⏺✔✓✗✻✶]\s/;
const TYPED = /^(?:type something\.?|chat about this)$/i;
const KEY_HINT = /\s\((?:[a-z]|esc|shift\+tab|tab)\)$/i;
const MAX_FOOTER_LINES = 3;
const MAX_BODY_LINES = 12;
const MAX_DETAILS = 3;
// A row this close to the screen's width was wrapped by the CLI itself, so the
// indented row under it carries on the same label rather than describing it.
const WRAP_MARGIN = 25;

const isBlank = (line: string) => line.trim() === "";

function lastOptionRow(lines: string[]): number {
  let footer = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (OPTION.test(lines[i])) return i;
    if (!isBlank(lines[i]) && !ANY_RULE.test(lines[i]) && ++footer > MAX_FOOTER_LINES) return -1;
  }
  return -1;
}

/** The row of option 1, walking up from the last option through the rows
 *  between them: descriptions, wrapped labels, rules and blank lines. */
function firstOptionRow(lines: string[], last: number): number {
  let expected = Number(OPTION.exec(lines[last])![3]);
  for (let i = last; i >= 0; i--) {
    const m = OPTION.exec(lines[i]);
    if (m) {
      if (Number(m[3]) !== expected) return -1;
      if (expected === 1) return i;
      expected--;
    } else if (!isBlank(lines[i]) && !ANY_RULE.test(lines[i]) && !/^\s{2,}\S/.test(lines[i])) {
      return -1;
    }
  }
  return -1;
}

function readOptions(lines: string[], first: number, last: number, cols: number): AgentDialogOption[] {
  const options: AgentDialogOption[] = [];
  let above = 0;
  for (let i = first; i <= last; i++) {
    const line = lines[i];
    const width = line.trimEnd().length;
    const m = OPTION.exec(line);
    if (m) {
      options.push({ key: m[3], label: m[4], description: "", selected: !!m[2], typed: false });
      above = width;
      continue;
    }
    const option = options[options.length - 1];
    if (!option || isBlank(line) || ANY_RULE.test(line)) {
      above = 0;
      continue;
    }
    const text = line.trim();
    if (above >= cols - WRAP_MARGIN && !option.description) {
      // A row cut at the very edge broke a word; one cut short broke at a space.
      option.label += above >= cols - 1 ? text : ` ${text}`;
    } else {
      option.description = option.description ? `${option.description} ${text}` : text;
    }
    above = width;
  }
  return options.map((option) => {
    const label = option.label.replace(KEY_HINT, "");
    return { ...option, label, typed: TYPED.test(label) };
  });
}

/** The rows above the options that say what is being asked, up to where the
 *  dialog starts: a full-width rule, or the transcript's last entry. */
function readBody(lines: string[], first: number): string[] {
  const body: string[] = [];
  for (let i = first - 1; i >= 0 && body.length < MAX_BODY_LINES; i--) {
    const line = lines[i];
    if (SOLID_RULE.test(line) || TRANSCRIPT_LINE.test(line)) break;
    if (isBlank(line) || ANY_RULE.test(line)) continue;
    body.unshift(line.trim());
  }
  return body;
}

/** The dialog at the bottom of `lines` (the screen's rows, top first), or null
 *  when the screen ends in anything else. `cols` is the screen's width. */
export function parseAgentDialog(lines: string[], cols: number): AgentDialog | null {
  const last = lastOptionRow(lines);
  if (last < 0) return null;
  const first = firstOptionRow(lines, last);
  if (first < 0) return null;
  const options = readOptions(lines, first, last, cols).filter((option) => option.key.length === 1);
  if (options.length < 2 || !options.some((option) => option.selected)) return null;
  const body = readBody(lines, first).filter((line) => !/^Tip:/i.test(line));
  const question = body.find((line) => line.endsWith("?")) ?? "";
  const details = body.filter((line) => line !== question).slice(0, MAX_DETAILS);
  return { question, details, options };
}

/** Whether two reads show the same dialog: same question and choices. */
export function sameDialog(a: AgentDialog | null, b: AgentDialog | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.question === b.question &&
    a.details.join("\n") === b.details.join("\n") &&
    a.options.length === b.options.length &&
    a.options.every((option, i) => option.key === b.options[i].key && option.label === b.options[i].label)
  );
}
