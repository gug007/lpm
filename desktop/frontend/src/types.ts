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
}

export interface ProjectInfo {
  name: string;
  session: string;
  root: string;
  running: boolean;
  services: ServiceInfo[];
  actions: ActionInfo[];
  profiles: string[];
  activeProfile: string;
}
