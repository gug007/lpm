import type {
  Action,
  ActionDef,
  Pane,
  RawConfig,
  Service,
  ServiceDef,
  TerminalDef,
  TerminalItem,
} from "./types";

export function normalizeService(key: string, def: ServiceDef): Service {
  if (typeof def === "string") return { key, cmd: def };
  return {
    key,
    cmd: def?.cmd ?? "",
    port: typeof def?.port === "number" ? def.port : undefined,
  };
}

export function normalizeAction(key: string, def: ActionDef): Action {
  if (typeof def === "string") {
    return { key, cmd: def, label: key, display: "menu", children: [] };
  }
  const children = def?.actions
    ? Object.entries(def.actions).map(([k, v]) => normalizeAction(k, v))
    : [];
  return {
    key,
    cmd: def?.cmd,
    label: def?.label ?? key,
    cwd: def?.cwd,
    env: def?.env,
    confirm: def?.confirm,
    display: def?.display === "button" ? "button" : "menu",
    type: def?.type,
    children,
  };
}

export function normalizeTerminal(key: string, def: TerminalDef): TerminalItem {
  if (typeof def === "string") {
    return { key, label: key, display: "menu" };
  }
  return {
    key,
    label: def?.label ?? key,
    display: def?.display === "button" ? "button" : "menu",
  };
}

export function resolveTerminalCmd(
  config: RawConfig | null,
  key: string,
): string {
  const def = config?.terminals?.[key];
  if (typeof def === "string") return def;
  return def?.cmd ?? "";
}

export function buildPanes(
  runningServices: Service[],
  openTerminals: TerminalItem[],
  config: RawConfig | null,
): Pane[] {
  const servicePanes: Pane[] = runningServices.map((s) => ({
    type: "service",
    id: `s:${s.key}`,
    key: s.key,
    label: s.key,
    cmd: s.cmd,
  }));
  const terminalPanes: Pane[] = openTerminals.map((t) => ({
    type: "terminal",
    id: `t:${t.key}`,
    key: t.key,
    label: t.label,
    cmd: resolveTerminalCmd(config, t.key),
  }));
  return [...servicePanes, ...terminalPanes];
}
