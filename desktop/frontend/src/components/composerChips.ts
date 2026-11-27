// What the composer shows as a chip, and how to find it in the field's text.
// A chip always stands for the exact text it replaces, so finding one is a
// pure function of the value: the "@" menu's blocks (logs, diffs, commits,
// pull requests, issues) by their headings, projects by their roots, another
// computer's folder by its reach note, and anything else the composer
// remembered inserting (pastes, quotes, files, branches) by its text.

import { folderName } from "../path";
import { plural } from "../projectArchive";

export type ChipKind =
  | "project"
  | "duplicate"
  | "computer"
  | "terminal"
  | "service"
  | "diff"
  | "commit"
  | "pr"
  | "issue"
  | "paste"
  | "quote"
  | "file"
  | "dir"
  | "branch";

// Where a chip came from, so its card can read it again.
export interface ChipSource {
  project?: string;
  terminalId?: string;
  paneIndex?: number;
  lines?: number;
  onlyErrors?: boolean;
  capturedAt?: number;
  files?: string[];
  allFiles?: string[];
  sha?: string;
  withDiff?: boolean;
  description?: boolean;
  discussion?: boolean;
  path?: string;
}

export interface ChipSpec {
  kind: ChipKind;
  label: string;
  detail?: string;
  title?: string;
  source?: ChipSource;
  // Shown as text on purpose ("Show as text"): never turned back into a chip.
  asText?: boolean;
}

// The text a chip stands for, with what it is.
export interface Captured {
  text: string;
  spec: ChipSpec;
}

interface ChipKindInfo {
  // What its "×" removes.
  noun: string;
  // What a click on it does, as its hover preview says it.
  hint: string;
  // Its colour family (globals.css); an attachment's sky without one.
  hue?: "place" | "git" | "output";
  // A short reference, not captured content: its card spells out the text the agent gets.
  short?: boolean;
}

const AGENT_GETS = "Click for what the agent gets";
const EVERY_LINE = "Click to see every line";
const READ_OR_EDIT = "Click to read or edit it";

export const CHIP_KINDS: Record<ChipKind, ChipKindInfo> = {
  project: { noun: "project", hint: AGENT_GETS, hue: "place", short: true },
  duplicate: { noun: "copy", hint: AGENT_GETS, hue: "place", short: true },
  computer: { noun: "folder", hint: AGENT_GETS, hue: "place", short: true },
  terminal: { noun: "output", hint: EVERY_LINE, hue: "output" },
  service: { noun: "logs", hint: EVERY_LINE, hue: "output" },
  diff: { noun: "changes", hint: "Click to choose which files go along", hue: "git" },
  commit: { noun: "commit", hint: "Click for the whole message", hue: "git" },
  pr: { noun: "pull request", hint: "Click to choose what goes along", hue: "git" },
  issue: { noun: "issue", hint: "Click to read it all", hue: "git" },
  paste: { noun: "paste", hint: READ_OR_EDIT },
  quote: { noun: "quote", hint: READ_OR_EDIT, hue: "output" },
  file: { noun: "file", hint: "Click to open it", short: true },
  dir: { noun: "folder", hint: AGENT_GETS, short: true },
  branch: { noun: "branch", hint: AGENT_GETS, hue: "git", short: true },
};

export interface ChipMatch {
  start: number;
  end: number;
  spec: ChipSpec;
}

export interface ChipContext {
  // Keyed by the text a project pick inserts: "@" + its root.
  projects: Map<string, ChipSpec>;
  // Texts this composer inserted, with what they are.
  saved: Map<string, ChipSpec>;
}

export const REACH_NOTE = " (on another computer; reach it with lpm exec --on and lpm cp)";

const AFTER = /[\s,;:!?)\]}'"]/;

export function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}

export const linesDetail = (text: string) => plural(lineCount(text), "line");

// Tidy a raw pane capture for the prompt: drop trailing spaces each line
// keeps, then strip blank lines that bookend the grab (a full-height pane pads
// the bottom), leaving the meaningful run intact.
export function trimLogBody(raw: string): string {
  return raw.replace(/[ \t]+$/gm, "").replace(/^\n+/, "").replace(/\n+$/, "");
}

const FAILED_LINE = /error|exception|fail|fatal|panic|✗|✘|traceback/i;
const ERROR_LINE = new RegExp(`${FAILED_LINE.source}|warn|^\\s+at\\s`, "i");
const NOTHING_FAILED = /\b(0|no) (errors?|failures?|failed)\b/i;

export function onlyErrorLines(body: string): string {
  return body
    .split("\n")
    .filter((l) => ERROR_LINE.test(l))
    .join("\n");
}

// Whether captured output shows something going wrong (errors only, not
// warnings): its chip carries a red dot.
export function chipFailed(text: string, spec: ChipSpec): boolean {
  if (spec.kind !== "terminal" && spec.kind !== "service") return false;
  return blockBody(text)
    .split("\n")
    .some((l) => FAILED_LINE.test(l) && !NOTHING_FAILED.test(l));
}

// A mention written out as text, standing alone: not part of a longer word or path.
function standsAlone(text: string, start: number, end: number): boolean {
  const prev = text[start - 1];
  if (prev !== undefined && !/[\s([{'"]/.test(prev)) return false;
  const next = text[end];
  if (next === undefined || AFTER.test(next)) return true;
  // A sentence's full stop, not a path going on ("@/repo.git").
  return next === "." && (text[end + 1] === undefined || /\s/.test(text[end + 1]));
}

export interface Block {
  heading: string;
  lang: string;
  body: string;
}

// A "<heading>:\n```lang\n<body>\n```\n" block (fencedBlock's shape) back into its parts.
export function parseBlock(text: string): Block | null {
  const m = /^([^\n]*):\n(`{3,})([\w-]*)\n([\s\S]*)\n\2\n?$/.exec(text);
  return m ? { heading: m[1], lang: m[3], body: m[4] } : null;
}

export const blockBody = (text: string) => parseBlock(text)?.body ?? "";

export interface DiffFile {
  path: string;
  // A key of STATUS_DISPLAY (ChangedFilesTree).
  status: "modified" | "added" | "deleted";
  added: number;
  removed: number;
}

export function diffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  for (const line of diff.split("\n")) {
    const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (head) {
      cur = { path: head[2], status: "modified", added: 0, removed: 0 };
      files.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith("new file mode")) cur.status = "added";
    else if (line.startsWith("deleted file mode")) cur.status = "deleted";
    else if (line.startsWith("+") && !line.startsWith("+++")) cur.added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) cur.removed += 1;
  }
  return files;
}

export interface CommitInfo {
  author: string;
  date: string;
  subject: string;
  message: string;
  hasDiff: boolean;
}

// GitShowCommit's "commit <sha>\nAuthor: …\nDate: …\n\n<message>…" (git_mentions.rs).
export function commitInfo(body: string): CommitInfo {
  const lines = body.split("\n");
  const author = /^Author: (.*)$/m.exec(body)?.[1] ?? "";
  const date = /^Date: (.*)$/m.exec(body)?.[1] ?? "";
  const start = lines.findIndex((l, i) => i > 0 && l === "") + 1;
  const end = lines.findIndex((l, i) => i >= start && (/^ \S.* \| /.test(l) || l.startsWith("diff --git")));
  const message = lines
    .slice(start, end === -1 ? undefined : end)
    .join("\n")
    .trim();
  return { author, date, subject: message.split("\n")[0] ?? "", message, hasDiff: /^diff --git /m.test(body) };
}

export interface ThreadInfo {
  number: number;
  title: string;
  url: string;
  excerpt: string;
  comments: number;
}

// The "#N title\nurl\n\nbody…" thread a pull request or issue mention carries.
export function threadInfo(body: string): ThreadInfo {
  const lines = body.split("\n");
  const head = /^#(\d+) (.*)$/.exec(lines[0] ?? "");
  const url = /^https?:\/\//.test(lines[1] ?? "") ? lines[1] : "";
  const rest = lines.slice(url ? 2 : 1);
  const split = rest.findIndex((l) => l === "Discussion:" || l === "Comments:");
  const excerpt = (split === -1 ? rest : rest.slice(0, split)).join("\n").trim();
  const comments = split === -1 ? 0 : rest.slice(split + 1).filter((l) => l.startsWith("- ")).length;
  return { number: head ? Number(head[1]) : 0, title: head?.[2] ?? "", url, excerpt, comments };
}

// A thread's chip says how many comments it carries, or its title without any.
export function threadDetail(thread: ThreadInfo, withComments = true): string {
  return withComments && thread.comments ? plural(thread.comments, "comment") : thread.title;
}

export function logSpec(kind: "terminal" | "service", label: string, body: string): ChipSpec {
  const lines = linesDetail(body);
  return { kind, label, detail: kind === "service" ? `logs · ${lines}` : lines };
}

// The "@" menu's blocks: the heading each is written under, and what a block
// under it is.
const BLOCKS: Array<[heading: RegExp, spec: (m: RegExpExecArray, body: string) => ChipSpec]> = [
  [/terminal output/, (_, body) => logSpec("terminal", "terminal", body)],
  [/(\S+) service logs/, (m, body) => logSpec("service", m[1], body)],
  [/Uncommitted changes \((\d+) files?\)/, (m) => ({ kind: "diff", label: "Uncommitted changes", detail: plural(Number(m[1]), "file") })],
  [
    /Commit ([0-9a-f]{7,40})/,
    (m, body) => ({ kind: "commit", label: m[1].slice(0, 7), detail: commitInfo(body).subject, source: { sha: m[1] } }),
  ],
  [/Pull request #(\d+)/, (m, body) => ({ kind: "pr", label: `#${m[1]}`, detail: threadDetail(threadInfo(body)) })],
  [/Issue #(\d+)/, (m, body) => ({ kind: "issue", label: `#${m[1]}`, detail: threadInfo(body).title })],
];
const HEADING_RE = new RegExp(`(?:${BLOCKS.map(([re]) => re.source).join("|")})$`);
const WHOLE_HEADING = BLOCKS.map(([re, spec]) => [new RegExp(`^${re.source}$`), spec] as const);
// Longer than any heading. Only the end of the line above a fence is searched
// for one: over a long unbroken line the search is quadratic.
const HEADING_MAX = 200;

export function blockSpec(heading: string, body: string): ChipSpec | null {
  for (const [re, spec] of WHOLE_HEADING) {
    const m = re.exec(heading);
    if (m) return spec(m, body);
  }
  return null;
}

export function computerSpec(name: string, path: string, label?: string): ChipSpec {
  return { kind: "computer", label: label || folderName(path) || path, detail: `on ${name}`, title: `${name}:${path}` };
}

function findBlocks(value: string, out: ChipMatch[]): void {
  const open = /:\n(`{3,})([\w-]*)\n/g;
  for (let m = open.exec(value); m; m = open.exec(value)) {
    const from = Math.max(value.lastIndexOf("\n", m.index - 1) + 1, m.index - HEADING_MAX);
    const head = HEADING_RE.exec(value.slice(from, m.index));
    if (!head) continue;
    const fence = m[1];
    const bodyStart = m.index + m[0].length;
    let close = bodyStart - 1;
    for (;;) {
      close = value.indexOf(`\n${fence}`, close);
      if (close === -1) break;
      const after = value[close + 1 + fence.length];
      if (after === undefined || after === "\n") break;
      close += 1;
    }
    if (close === -1 || close < bodyStart) continue;
    const fenceEnd = close + 1 + fence.length;
    const end = value[fenceEnd] === "\n" ? fenceEnd + 1 : fenceEnd;
    const spec = blockSpec(head[0], value.slice(bodyStart, close));
    if (spec) out.push({ start: from + head.index, end, spec });
    open.lastIndex = end;
  }
}

// "NAME:PATH" in front of its reach note, found from the note backwards: a
// pattern for it backtracks for seconds over a long unbroken line (a pasted
// one-line JSON).
function findComputers(value: string, out: ChipMatch[]): void {
  let floor = 0;
  for (let note = value.indexOf(REACH_NOTE); note !== -1; note = value.indexOf(REACH_NOTE, note + 1)) {
    let start = note;
    while (start > floor && !/\s/.test(value[start - 1])) start -= 1;
    const colon = value.lastIndexOf(":", note - 2);
    if (colon <= start) continue;
    floor = note + REACH_NOTE.length;
    out.push({ start, end: floor, spec: computerSpec(value.slice(start, colon), value.slice(colon + 1, note)) });
  }
}

function findTexts(value: string, texts: Map<string, ChipSpec>, out: ChipMatch[]): void {
  for (const [key, spec] of texts) {
    if (!key) continue;
    const short = key.startsWith("@") && !key.includes("\n");
    for (let at = value.indexOf(key); at !== -1; at = value.indexOf(key, at + 1)) {
      if (short && !standsAlone(value, at, at + key.length)) continue;
      out.push({ start: at, end: at + key.length, spec });
    }
  }
}

// Every chip in `value`, in order and never overlapping. What this composer
// inserted wins over what is only recognized, except a paste: pasted logs or a
// pasted diff show as what they are. The longer match wins a tie.
export function findChips(value: string, ctx: ChipContext): ChipMatch[] {
  const saved: ChipMatch[] = [];
  findTexts(value, ctx.saved, saved);
  const found: ChipMatch[] = [];
  findTexts(value, ctx.projects, found);
  findBlocks(value, found);
  findComputers(value, found);
  const byLength = (a: ChipMatch, b: ChipMatch) => b.end - b.start - (a.end - a.start) || a.start - b.start;
  const isPaste = (m: ChipMatch) => m.spec.kind === "paste" && !m.spec.asText;
  const pasted = saved.filter(isPaste);
  const inserted = saved.filter((m) => !isPaste(m));
  const taken: ChipMatch[] = [];
  const overlaps = (m: ChipMatch) => taken.some((t) => m.start < t.end && t.start < m.end);
  for (const m of [...inserted.sort(byLength), ...found.sort(byLength), ...pasted.sort(byLength)]) {
    if (!overlaps(m)) taken.push(m);
  }
  return taken.filter((m) => !m.spec.asText).sort((a, b) => a.start - b.start);
}
