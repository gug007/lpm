import type { ComposerValue } from "./components/composerEditor";

export interface ServiceInfo {
  name: string;
  cmd: string;
  cwd: string;
  port: number;
  portConflict?: ActionPortConflict;
  env?: Record<string, string>;
}

export interface ProfileInfo {
  name: string;
  services: string[];
}

export type ActionType = "terminal" | "background" | (string & {});

export type ActionDisplay = "header" | "menu" | "footer" | (string & {});

export type ActionPortConflict = "ask" | "free" | "fail";

// "" / "header" / "button" all render in the header row. "button" is the
// legacy alias kept around for back-compat.
export const isHeaderDisplay = (d: string) =>
  d === "" || d === "header" || d === "button";
export const isFooterDisplay = (d: string) => d === "footer";

export interface ActionsLayout {
  header: string[];
  footer: string[];
}

export interface ActionInputOption {
  label: string;
  value: string;
}

export interface ActionInputInfo {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  default: string;
  options?: ActionInputOption[];
}

export interface ActionInfo {
  name: string;
  label: string;
  emoji?: string;
  cmd: string;
  cwd?: string;
  port?: number[];
  portConflict?: ActionPortConflict;
  env?: Record<string, string>;
  confirm: boolean;
  display: ActionDisplay;
  type?: ActionType;
  reuse?: boolean;
  position?: number;
  inputs?: ActionInputInfo[];
  children?: ActionInfo[];
}

// A task to run on each freshly created copy from "Bulk Duplicate": either an
// existing project action or an ad-hoc shell command typed by the user. An
// optional `prompt` is typed into the terminal once the launched program is
// ready — mainly to seed an AI agent with a task.
export type SpawnTask =
  | { kind: "action"; actionName: string; prompt?: string }
  | { kind: "command"; command: string; prompt?: string };

// What a duplicated copy runs once created: nothing, a project action, or an
// ad-hoc command — the authoring side of SpawnTask in the "Bulk Duplicate" flow.
export type RunMode = "none" | "action" | "command";

// A copy's per-run override of the shared default. `null` at the call site means
// the copy inherits the default; an override carries its own prompt — the same
// composer value as the shared default, including any attached images.
export interface CopyOverride {
  mode: RunMode;
  actionName: string;
  command: string;
  prompt: ComposerValue;
}

// A copy's run-mode choice in the duplicate UI, including the "default" sentinel
// that means "inherit the shared default" rather than override it.
export type CopyRunMode = RunMode | "default";

export interface ProjectInfo {
  name: string;
  session: string;
  root: string;
  label?: string;
  running: boolean;
  services: ServiceInfo[];
  allServices: ServiceInfo[];
  actions: ActionInfo[];
  profiles: ProfileInfo[];
  activeProfile: string;
  statusEntries: StatusEntry[];
  configError?: string;
  parentName?: string;
  isRemote: boolean;
}

// A user-created sidebar folder. Persisted in ~/.lpm/groups.json; `members` are
// project names in their within-folder order — usually top-level projects, but
// a duplicate explicitly placed in a folder is listed here too (promoted out of
// its parent's nesting).
export interface ProjectGroup {
  id: string;
  name: string;
  collapsed?: boolean;
  members: string[];
}

// A project is a duplicate (renders as a child of its parent) when its parent
// is also present in the list. `present.has` is satisfied by a Set of names or
// a Map keyed by name. This is the single rule for "is this a top-level project"
// — the names eligible for sidebar order/folder membership are the non-duplicates.
export function isDuplicate(
  project: ProjectInfo,
  present: { has(name: string): boolean },
): boolean {
  return !!(project.parentName && present.has(project.parentName));
}

export const STATUS_RUNNING = "Running";
export const STATUS_DONE = "Done";
export const STATUS_WAITING = "Waiting";
export const STATUS_ERROR = "Error";

export const GIT_CHANGED_EVENT = "git-changed";

export type AICLI = "claude" | "codex" | "gemini" | "opencode";

export interface AIModelOption {
  value: string;
  label: string;
}

export interface AIEffortOption {
  value: string;
  label: string;
}

export interface AICLIOption {
  value: AICLI;
  label: string;
  models?: AIModelOption[];
  efforts?: AIEffortOption[];
}

// Claude Code's --effort flag accepts low/medium/high/xhigh/max
// (verified via `claude --help`). "" means omit the flag and use the
// CLI default.
const CLAUDE_EFFORTS: AIEffortOption[] = [
  { value: "", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

// Codex's `-c model_reasoning_effort=...` config accepts
// low/medium/high/xhigh. `minimal` exists in the codex CLI source but
// is rejected by current GPT-5.x models — kept out to avoid surfacing
// an option that errors at run time. "max" is Claude-only.
const CODEX_EFFORTS: AIEffortOption[] = [
  { value: "", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
];

export const AI_CLI_OPTIONS: AICLIOption[] = [
  {
    value: "claude",
    label: "Claude Code",
    models: [
      { value: "", label: "Default" },
      { value: "sonnet", label: "Sonnet" },
      { value: "opus", label: "Opus" },
      { value: "haiku", label: "Haiku" },
    ],
    efforts: CLAUDE_EFFORTS,
  },
  {
    value: "codex",
    label: "Codex",
    models: [
      { value: "", label: "Default" },
      { value: "gpt-5.5", label: "GPT-5.5" },
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { value: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
      { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    ],
    efforts: CODEX_EFFORTS,
  },
  { value: "gemini", label: "Gemini" },
  { value: "opencode", label: "OpenCode" },
];

export function aiPickLabel(cli: AICLI, model: string): string {
  const opt = AI_CLI_OPTIONS.find((o) => o.value === cli);
  const base = opt?.label ?? cli;
  if (!model) return base;
  const m = opt?.models?.find((x) => x.value === model)?.label ?? model;
  return `${base} ${m}`;
}

export function aiDefaultModel(cli: AICLI): string {
  return AI_CLI_OPTIONS.find((o) => o.value === cli)?.models?.[0]?.value ?? "";
}

// Codex Fast Mode (`service_tier=fast`) is currently honored only by the
// flagship 5.x models. Listing the eligible models centrally so the picker
// and the call-site guard agree.
const CODEX_FAST_MODELS: ReadonlySet<string> = new Set(["gpt-5.5", "gpt-5.4"]);

export function aiSupportsFast(cli: AICLI, model: string): boolean {
  return cli === "codex" && CODEX_FAST_MODELS.has(model);
}

// effectiveFast collapses the saved toggle to false whenever the current
// CLI/model wouldn't accept it, so call sites can pass the result straight
// into the backend binding without re-checking eligibility.
export function aiEffectiveFast(
  cli: AICLI,
  model: string,
  fast: boolean,
): boolean {
  return fast && aiSupportsFast(cli, model);
}

export function resolveAIPick(
  savedCli: string | undefined,
  savedModel: string | undefined,
  aiCLIs: Record<string, boolean>,
): { cli: AICLI; model: string } | null {
  if (savedCli && aiCLIs[savedCli]) {
    const opt = AI_CLI_OPTIONS.find((o) => o.value === savedCli);
    if (opt) {
      const m = savedModel ?? "";
      const valid = opt.models
        ? opt.models.some((x) => x.value === m)
        : m === "";
      return { cli: opt.value, model: valid ? m : aiDefaultModel(opt.value) };
    }
  }
  const fallback = AI_CLI_OPTIONS.find((o) => aiCLIs[o.value]);
  if (!fallback) return null;
  return { cli: fallback.value, model: aiDefaultModel(fallback.value) };
}

export interface StatusEntry {
  key: string;
  value: string;
  icon?: string;
  color?: string;
  priority: number;
  timestamp: number;
  paneID?: string;
}
