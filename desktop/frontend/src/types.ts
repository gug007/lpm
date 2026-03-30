export interface ServiceInfo {
  name: string;
  cmd: string;
  cwd: string;
  port: number;
}

export interface ProjectInfo {
  name: string;
  session: string;
  root: string;
  running: boolean;
  services: ServiceInfo[];
  profiles: string[];
}
