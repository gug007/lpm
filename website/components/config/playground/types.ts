export type ServiceDef =
  | string
  | {
      cmd?: string;
      cwd?: string;
      port?: number;
      env?: Record<string, string>;
      profiles?: string[];
    };

export type ActionDef =
  | string
  | {
      cmd?: string;
      label?: string;
      cwd?: string;
      env?: Record<string, string>;
      confirm?: boolean;
      display?: "button" | "menu";
      actions?: Record<string, ActionDef>;
    };

export type TerminalDef =
  | string
  | {
      cmd?: string;
      label?: string;
      cwd?: string;
      env?: Record<string, string>;
      display?: "button" | "menu";
    };

export type RawConfig = {
  name?: string;
  root?: string;
  services?: Record<string, ServiceDef>;
  actions?: Record<string, ActionDef>;
  terminals?: Record<string, TerminalDef>;
  profiles?: Record<string, string[]>;
};

export type Service = {
  key: string;
  cmd: string;
  port?: number;
};

export type Action = {
  key: string;
  cmd?: string;
  label: string;
  cwd?: string;
  env?: Record<string, string>;
  confirm?: boolean;
  display: "button" | "menu";
  children: Action[];
};

export type TerminalItem = {
  key: string;
  label: string;
  display: "button" | "menu";
};

export type Pane = {
  type: "service" | "terminal";
  id: string;
  key: string;
  label: string;
  cmd: string;
};

export type ModalPhase = "idle" | "running" | "result";
