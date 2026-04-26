export interface ServiceInfo {
  name: string;
  cmd: string;
  cwd: string;
  port: number;
}

export interface ProfileInfo {
  name: string;
  services: string[];
}

export type ActionType = "terminal" | "background" | (string & {});

export type ActionDisplay = "button" | "menu" | "footer" | (string & {});

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
  cmd: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  confirm: boolean;
  display: ActionDisplay;
  type?: ActionType;
  reuse?: boolean;
  inputs?: ActionInputInfo[];
  children?: ActionInfo[];
}

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

export interface AICLIOption {
  value: AICLI;
  label: string;
  models?: AIModelOption[];
}

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
  },
  {
    value: "codex",
    label: "Codex",
    models: [
      { value: "", label: "Default" },
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    ],
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

export function resolveAIPick(
  savedCli: string | undefined,
  savedModel: string | undefined,
  aiCLIs: Record<string, boolean>,
): { cli: AICLI; model: string } | null {
  if (savedCli && aiCLIs[savedCli]) {
    const opt = AI_CLI_OPTIONS.find((o) => o.value === savedCli);
    if (opt) {
      const m = savedModel ?? "";
      const valid = opt.models ? opt.models.some((x) => x.value === m) : m === "";
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
