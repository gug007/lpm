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
}
