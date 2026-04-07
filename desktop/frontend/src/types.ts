export interface ServiceInfo {
  name: string;
  cmd: string;
  cwd: string;
  port: number;
}

export interface ActionInfo {
  name: string;
  label: string;
  confirm: boolean;
  display: string;
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
  actions: ActionInfo[];
  terminals: TerminalConfigInfo[];
  profiles: string[];
  activeProfile: string;
  statusEntries: StatusEntry[];
}

export const STATUS_RUNNING = "Running";
export const STATUS_DONE = "Done";
export const STATUS_WAITING = "Waiting";

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
