import {
  AI_CLI_OPTIONS,
  aiEfforts,
  type AICLI,
  type AIEffortOption,
  type AIModelOption,
} from "./types";

// Re-pointing a *running* agent at another model is CLI-specific, and only two
// CLIs expose it at all: Claude Code takes "/model <name>" and "/effort <level>"
// as one-shot commands, while Codex only has an interactive picker that lpm has
// to walk (see codexPickerView). Gemini and OpenCode offer neither, so their
// terminals get no switcher.
export type SwitchableCLI = "claude" | "codex";

export function switchableCLI(cli: AICLI | null | undefined): SwitchableCLI | null {
  return cli === "claude" || cli === "codex" ? cli : null;
}

/** What a pick sets. Either half may be null — picking a model leaves the effort
 *  alone, and vice versa. */
export interface ModelPick {
  model: string;
  effort: string;
}

export const EMPTY_PICK: ModelPick = { model: "", effort: "" };

// The models a live session can be moved to. The launch-time "Default" entry
// (empty value = "don't pass --model") is dropped: there is no command that
// un-pins a model mid-session, only ones that pin a different one.
export function switchModels(cli: SwitchableCLI): AIModelOption[] {
  return (AI_CLI_OPTIONS.find((o) => o.value === cli)?.models ?? []).filter((m) => m.value);
}

// "/effort ultracode" is xhigh plus standing dynamic-workflow orchestration. It
// belongs to the slash command alone — `claude --effort` takes only
// low|medium|high|xhigh|max, which is why it is added here and not to the launch
// options in types.ts that feed that flag. Claude offers it only on the models
// that do the orchestrating; Haiku is left out, as `claude --model haiku -p
// /effort` reports.
const CLAUDE_ULTRACODE_MODELS: ReadonlySet<string> = new Set(["fable", "opus", "sonnet"]);

// The effort levels a live session can be moved to. Claude keeps the "Default"
// slot as "Auto" — "/effort auto" really does hand the level back to the model —
// while Codex's picker has no such row, so its empty entry is dropped.
export function switchEfforts(cli: SwitchableCLI, model: string): AIEffortOption[] {
  const all = aiEfforts(cli, model);
  if (cli !== "claude") return all.filter((e) => e.value);
  const base = all.map((e) => (e.value ? e : { value: "auto", label: "Auto" }));
  // Last, matching the order Claude's own "/effort" usage line prints.
  return CLAUDE_ULTRACODE_MODELS.has(model)
    ? [...base, { value: "ultracode", label: "Ultracode" }]
    : base;
}

/** Every level any of this CLI's models offers, in menu order. A menu that
 *  lists these and greys out the ones the highlighted model can't take keeps one
 *  height as the highlight moves — and shows *why* a level is missing instead of
 *  quietly dropping the row. */
export function switchEffortUnion(cli: SwitchableCLI): AIEffortOption[] {
  const seen = new Map<string, AIEffortOption>();
  for (const model of switchModels(cli)) {
    for (const effort of switchEfforts(cli, model.value)) {
      if (!seen.has(effort.value)) seen.set(effort.value, effort);
    }
  }
  return [...seen.values()];
}

/** Drop a remembered level the model doesn't take. For a level lpm is carrying
 *  over rather than reading back: Claude clamps one on the way to a model
 *  without it and never says what it clamped to, so the old value is not worth
 *  keeping. Never apply it to a level an agent actually printed. */
export function switchEffectiveEffort(
  cli: SwitchableCLI,
  model: string,
  effort: string,
): string {
  return switchEfforts(cli, model).some((e) => e.value === effort) ? effort : "";
}

export function modelLabel(cli: SwitchableCLI, model: string): string {
  return switchModels(cli).find((m) => m.value === model)?.label ?? model;
}

export function effortLabel(cli: SwitchableCLI, model: string, effort: string): string {
  return switchEfforts(cli, model).find((e) => e.value === effort)?.label ?? effort;
}

/** The pick as the button reads it out — "Opus · High", "Opus", or "" when
 *  nothing about the session's model is known yet. */
export function pickSummary(cli: SwitchableCLI, pick: ModelPick): string {
  const parts: string[] = [];
  if (pick.model) parts.push(modelLabel(cli, pick.model));
  if (pick.effort) parts.push(effortLabel(cli, pick.model, pick.effort));
  return parts.join(" · ");
}

// ---- Claude: one-shot slash commands ---------------------------------------
// Reading a Claude pane back is `claudeReadback.ts`: it takes four readouts to
// Codex's one, and none of them is a readout in the way Codex's status line is.

export function claudeSwitchCommand(kind: "model" | "effort", value: string): string {
  return `/${kind} ${value}`;
}

// ---- Codex: walking the "/model" picker ------------------------------------

/** One numbered row of a Codex picker list, as drawn on screen. */
export interface PickerRow {
  /** The row's own printed number — 1-based, and what the cursor math counts in. */
  index: number;
  /** The row's name with its "(current)" / "(default)" annotation stripped: a
   *  model slug on the model list, a level name on the effort list. */
  label: string;
  /** True for the row the "›" cursor sits on. */
  selected: boolean;
  /** True for the row marked "(current)" — the model the session runs now. */
  current: boolean;
}

/** Which list is on screen. "other" covers a list lpm can still walk but can't
 *  name — the submenu behind Codex's "More reasoning…" row, for one. */
export type PickerKind = "model" | "effort" | "other";

export interface PickerView {
  kind: PickerKind;
  /** The model an effort list belongs to ("Select Reasoning Level for <slug>");
   *  empty on every other list. */
  model: string;
  rows: PickerRow[];
}

// Every Codex picker draws this under its rows, and only while it is open — so
// it is what tells "the picker is up" from "the picker has closed again".
const PICKER_FOOTER = /Press enter to confirm/i;
const MODEL_HEADER = /Select\s+Model/i;
const EFFORT_HEADER = /Select\s+Reasoning\s+Level(?:\s+for\s+(\S+))?/i;
// "› 1. gpt-6-astra (current)  Our most capable model…" — the description is
// separated from the name by a run of padding spaces.
const PICKER_ROW = /^\s*(›?)\s*(\d+)\.\s+(\S.*)$/;
// How far above the row block a header may sit and still be read as its title.
const HEADER_LOOKBACK = 4;

function parseRow(line: string): PickerRow | null {
  const m = PICKER_ROW.exec(line);
  if (!m) return null;
  const rest = m[3].split(/\s{2,}/)[0].trim();
  return {
    index: Number(m[2]),
    label: rest.replace(/\((?:current|default)\)/gi, "").trim(),
    selected: m[1] === "›",
    current: /\(current\)/i.test(rest),
  };
}

/** Read the Codex picker off a terminal screen — the *viewport* only, never
 *  scrollback: Codex redraws the whole visible region, so a picker that has
 *  since been confirmed leaves nothing behind to be mistaken for a live one.
 *  Null when no picker is open. */
export function codexPickerView(screen: string): PickerView | null {
  const lines = screen.split("\n").map((l) => l.replace(/\s+$/, ""));
  let footer = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (PICKER_FOOTER.test(lines[i])) {
      footer = i;
      break;
    }
  }
  if (footer < 0) return null;

  // The rows sit in the block of non-blank lines above the footer. Non-row lines
  // inside that block are kept walking past, not treated as its top edge: a long
  // description wraps onto its own line at a narrow width, and stopping there
  // would silently drop every row above it — which reads as "Codex doesn't offer
  // that model" rather than as the parse failure it is.
  let i = footer - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  const rows: PickerRow[] = [];
  for (; i >= 0 && lines[i].trim(); i--) {
    const row = parseRow(lines[i]);
    if (row) rows.unshift(row);
  }
  if (rows.length === 0) return null;

  let kind: PickerKind = "other";
  let model = "";
  for (let j = i; j >= 0 && j > i - HEADER_LOOKBACK; j--) {
    const effort = EFFORT_HEADER.exec(lines[j]);
    if (effort) {
      kind = "effort";
      model = effort[1] ?? "";
      break;
    }
    if (MODEL_HEADER.test(lines[j])) {
      kind = "model";
      break;
    }
  }
  return { kind, model, rows };
}

// Codex prints level names, lpm stores the flag values codex itself takes on the
// command line; this is the one place the two vocabularies meet.
const EFFORT_BY_LABEL: Record<string, string> = {
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  "extra high": "xhigh",
  xhigh: "xhigh",
  max: "max",
  ultra: "ultra",
};

export function effortValueOf(label: string): string | null {
  return EFFORT_BY_LABEL[label.trim().toLowerCase()] ?? null;
}

export function findModelRow(rows: PickerRow[], model: string): PickerRow | null {
  const want = model.toLowerCase();
  return rows.find((r) => r.label.toLowerCase() === want) ?? null;
}

export function findEffortRow(rows: PickerRow[], effort: string): PickerRow | null {
  return rows.find((r) => effortValueOf(r.label) === effort) ?? null;
}

/** The row that opens Codex's second page of levels (Max and Ultra live there,
 *  not on the first). Null when the list has no such row. */
export function findMoreEffortsRow(rows: PickerRow[]): PickerRow | null {
  return rows.find((r) => /more reasoning/i.test(r.label)) ?? null;
}

export function selectedRow(rows: PickerRow[]): PickerRow | null {
  return rows.find((r) => r.selected) ?? null;
}

const ARROW_DOWN = "\x1b[B";
const ARROW_UP = "\x1b[A";

/** The keystrokes that walk the cursor from where it sits to `target`. Empty
 *  when it is already there; null when the screen shows no cursor at all, which
 *  means the list isn't ready to be driven yet. */
export function moveKeys(rows: PickerRow[], target: PickerRow): string | null {
  const from = selectedRow(rows);
  if (!from) return null;
  const delta = target.index - from.index;
  return delta >= 0 ? ARROW_DOWN.repeat(delta) : ARROW_UP.repeat(-delta);
}

// ---- Codex: reading back what the session actually runs ---------------------

const CODEX_EFFORTS = "minimal|low|medium|high|xhigh|max|ultra";
// A model slug, as Codex prints it: "gpt-6-astra", "gpt-5.3-codex", "o3". Pinned
// to the families Codex serves rather than any word, because the status line's
// other segments are words too — a git branch called "main" must not be read as
// a model.
const SLUG = String.raw`(?:gpt-\d|o\d|codex)[A-Za-z0-9._-]*`;

// Codex's two *live* readouts — chrome it redraws, so whatever they show is what
// the session runs now. The status line's segments are user-ordered, so the
// model is matched as one " · "-delimited segment wherever it sits: lpm's own
// default puts it first, followed by the directory, not by anything fixed. The
// welcome box carries "/model to change" beside it.
const CODEX_STATUS_LINE = new RegExp(
  String.raw`(?:^|·)\s*(${SLUG})(?:\s+(${CODEX_EFFORTS}))?\s*(?=·|$)`,
  "gim",
);
const CODEX_WELCOME_LINE = new RegExp(
  String.raw`\bmodel:\s+(${SLUG})(?:\s+(${CODEX_EFFORTS}))?\s+/model to change`,
  "gi",
);
// The banner a confirmed switch prints, on its own line under Codex's bullet.
// This is an *event*, not a readout: it stays in the transcript afterwards, so
// callers count banners rather than reading the newest one as current state.
const CODEX_CHANGE_BANNER = new RegExp(
  String.raw`^\s*[•*]?\s*Model changed to\s+(${SLUG})(?:\s+(${CODEX_EFFORTS}))?\s*$`,
  "gim",
);

function pickFrom(match: RegExpMatchArray): ModelPick {
  return { model: match[1], effort: (match[2] ?? "").toLowerCase() };
}

/** What a Codex screen says the session runs right now, from the status line
 *  first and the welcome box second — the two readouts Codex keeps up to date.
 *  Null when neither is visible: the status line is user-configurable, so
 *  absence means "unknown", never "default". */
export function codexCurrentPick(screen: string): ModelPick | null {
  for (const re of [CODEX_STATUS_LINE, CODEX_WELCOME_LINE]) {
    const all = [...screen.matchAll(re)];
    const m = all[all.length - 1];
    if (m) return pickFrom(m);
  }
  return null;
}

/** Every "Model changed to …" banner on the screen, oldest first. A switch is
 *  confirmed by a *new* banner appearing, so the driver compares counts rather
 *  than trusting one that was already there before it started. */
export function codexChangeBanners(screen: string): ModelPick[] {
  return [...screen.matchAll(CODEX_CHANGE_BANNER)].map(pickFrom);
}
