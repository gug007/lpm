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

export interface StatusEntry {
  key: string;
  value: string;
  icon?: string;
  color?: string;
  priority: number;
  timestamp: number;
  paneID?: string;
}
