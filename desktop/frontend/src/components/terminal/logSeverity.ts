import { stripAnsi } from "./filterLines";

export type LogSeverity = "error" | "warning";

export interface SeverityTally {
  errors: number;
  warnings: number;
  /** Inside an error's block: the error line or the stack under it. */
  inError: boolean;
  /** The last line was part of that stack, so an error line right after it
   *  (Python's closing `ValueError:`) ends the same error. */
  afterStack: boolean;
}

export const EMPTY_TALLY: SeverityTally = { errors: 0, warnings: 0, inError: false, afterStack: false };

const NOTHING_WRONG = /\b(?:0|no|zero|without)\s+(?:errors?|warnings?|problems?)\b/i;

const ERROR_PATTERNS = [
  /\b(?:ERROR|FATAL|CRITICAL|PANIC|EMERG)\b|\bERR!/,
  /\blevel["']?\s*[=:]\s*["']?(?:error|err|fatal|critical|panic)\b/i,
  /^\s*(?:\[(?:error|fatal)\]|\((?:error|fatal)\)|(?:error|fatal)(?:\[[A-Z]?\d+\])?(?::|\s{2,}|\s-\s))/i,
  /^\s*[⨯✖✗✘×]\s/,
  /^\s*\d+:\d+\s+error\s{2}/,
  /\berror(?:\[[A-Z]?\d+\])?:/,
  /\berror TS\d+\b/,
  /(?:^|\s)Error:/,
  /\b[A-Z][A-Za-z0-9_]*(?:Error|Exception)\b(?::|\s\(|$)/,
  /^[A-Z]\w*(?:::[A-Z]\w*)+ \(/,
  /^Traceback \(most recent call last\)/,
  /^panic: |^thread '.*' panicked at /,
  /\bUnhandled ?(?:Promise ?)?Rejection|\bUncaught\b/,
  /\bCompleted 5\d\d\b/,
  /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+(?:\s+HTTP\/[\d.]+")?\s+5\d\d\b/,
];

const WARNING_PATTERNS = [
  /\b(?:WARN|WARNING)\b/,
  /\blevel["']?\s*[=:]\s*["']?(?:warn|warning)\b/i,
  /^\s*(?:\[(?:warn|warning)\]|\((?:warn|warning)\)|(?:warn|warning)(?::|\s{2,}|\s-\s))/i,
  /^\s*\d+:\d+\s+warning\s{2}/,
  /\bwarning(?:\[[\w-]+\])?:/,
  /(?:^|[\s)])Warning:/,
  /\b[A-Z][A-Za-z0-9_]*Warning\b/,
  /⚠/,
];

/** A word or mark every pattern above needs, so one test rules out most lines;
 *  keep it in step with them. */
const MIGHT_REPORT = /err|fatal|crit|panic|emerg|exception|traceback|unhandled|uncaught|warn|::|5\d\d|[⚠⨯✖✗✘×]/i;

const STACK_LINE = /^\s+\S|^\s*(?:at |File "|from |Caused by:|\.\.\. \d+ more)/;

/** What a plain-text log line reports, judged by the shapes dev servers, build
 *  tools and loggers print errors and warnings in. Stack frames under an error
 *  are not errors of their own. */
export function lineSeverity(line: string): LogSeverity | null {
  if (!MIGHT_REPORT.test(line) || /^\s+at\s/.test(line) || NOTHING_WRONG.test(line)) return null;
  if (ERROR_PATTERNS.some((pattern) => pattern.test(line))) return "error";
  if (WARNING_PATTERNS.some((pattern) => pattern.test(line))) return "warning";
  return null;
}

/** Counts the errors and warnings in `lines`, carrying on from `from`: an
 *  error with its stack, Python's traceback and closing line included, counts
 *  once. */
export function tallyLines(lines: string[], from: SeverityTally = EMPTY_TALLY): SeverityTally {
  let { errors, warnings, inError, afterStack } = from;
  for (const raw of lines) {
    const line = stripAnsi(raw).trimEnd();
    if (!line.trim()) {
      inError = false;
      afterStack = false;
      continue;
    }
    const severity = lineSeverity(line);
    if (severity === "error") {
      if (!(inError && afterStack)) errors++;
      inError = true;
      afterStack = false;
    } else if (!severity && inError && STACK_LINE.test(line)) {
      afterStack = true;
    } else {
      if (severity === "warning") warnings++;
      inError = false;
      afterStack = false;
    }
  }
  return { errors, warnings, inError, afterStack };
}

const MAX_STACK_LINES = 30;

/** The lines of `ansiText` reporting `severity`, colours kept, one block per
 *  report: an error comes with the stack printed under it. */
export function severityBlocks(ansiText: string, severity: LogSeverity): string[][] {
  const blocks: string[][] = [];
  let stack = 0;
  for (const raw of ansiText.split(/\r?\n/)) {
    const line = stripAnsi(raw).trimEnd();
    const found = line.trim() ? lineSeverity(line) : null;
    if (found === severity) {
      blocks.push([raw]);
      stack = severity === "error" ? MAX_STACK_LINES : 0;
    } else if (!found && stack > 0 && line.trim() && STACK_LINE.test(line)) {
      blocks[blocks.length - 1].push(raw);
      stack--;
    } else {
      stack = 0;
    }
  }
  return blocks;
}

export function severityLines(ansiText: string, severity: LogSeverity): string[] {
  return severityBlocks(ansiText, severity).flat();
}
