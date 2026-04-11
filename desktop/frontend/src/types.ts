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

export type ActionType = "terminal" | (string & {});

export interface ActionInputInfo {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  default: string;
}

export interface ActionInfo {
  name: string;
  label: string;
  cmd: string;
  cwd?: string;
  env?: Record<string, string>;
  confirm: boolean;
  display: string;
  type?: ActionType;
  inputs?: ActionInputInfo[];
}

export interface TerminalConfigInfo {
  name: string;
  label: string;
  cmd: string;
  display: string;
}

export interface ProjectInfo {
  name: string;
  session: string;
  root: string;
  running: boolean;
  services: ServiceInfo[];
  allServices: ServiceInfo[];
  actions: ActionInfo[];
  terminals: TerminalConfigInfo[];
  profiles: ProfileInfo[];
  activeProfile: string;
  statusEntries: StatusEntry[];
  configError?: string;
  parentName?: string;
}

export const STATUS_RUNNING = "Running";
export const STATUS_DONE = "Done";
export const STATUS_WAITING = "Waiting";
export const STATUS_ERROR = "Error";

export const GIT_CHANGED_EVENT = "git-changed";

export type AICLI = "claude" | "codex" | "gemini" | "opencode";

export const AI_CLI_OPTIONS: { value: AICLI; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "opencode", label: "OpenCode" },
];

export interface StatusEntry {
  key: string;
  value: string;
  icon?: string;
  color?: string;
  priority: number;
  timestamp: number;
  paneID?: string;
}
