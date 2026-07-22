import type {
  Action,
  ActionDef,
  Pane,
  Service,
  ServiceDef,
  TerminalDef,
  TerminalItem,
} from "./types";

type Display = Action["display"];

function normalizeDisplay(d: string | undefined): Display {
  if (d === "footer" || d === "menu") return d;
  return "header";
}

function withEmoji(emoji: string | undefined, label: string): string {
  return emoji ? `${emoji} ${label}` : label;
}

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
    return { key, cmd: def, label: key, display: "header", children: [] };
  }
  const children = def?.actions
    ? sortByPosition(
        Object.entries(def.actions).map(([k, v]) => normalizeAction(k, v)),
      )
    : [];
  return {
    key,
    cmd: def?.cmd,
    label: withEmoji(def?.emoji, def?.label ?? key),
    cwd: def?.cwd,
    env: def?.env,
    confirm: def?.confirm,
    display: normalizeDisplay(def?.display),
    type: def?.type,
    position: typeof def?.position === "number" ? def.position : undefined,
    primary: def?.primary,
    children,
  };
}

export function normalizeTerminal(key: string, def: TerminalDef): TerminalItem {
  if (typeof def === "string") {
    return { key, cmd: def, label: key, display: "header" };
  }
  return {
    key,
    cmd: def?.cmd ?? "",
    label: withEmoji(def?.emoji, def?.label ?? key),
    display: normalizeDisplay(def?.display),
    position: typeof def?.position === "number" ? def.position : undefined,
  };
}

export function terminalFromAction(action: Action): TerminalItem {
  return {
    key: action.key,
    cmd: action.cmd ?? "",
    label: action.label,
    display: action.display,
    position: action.position,
  };
}

export function sortByPosition<T extends { key: string; position?: number }>(
  items: T[],
): T[] {
  return items.slice().sort((a, b) => {
    const ap = a.position;
    const bp = b.position;
    if (ap !== undefined && bp !== undefined) {
      return ap - bp || a.key.localeCompare(b.key);
    }
    if (ap !== undefined) return -1;
    if (bp !== undefined) return 1;
    return a.key.localeCompare(b.key);
  });
}

export function buildPanes(
  runningServices: Service[],
  openTerminals: TerminalItem[],
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
    cmd: t.cmd,
  }));
  return [...servicePanes, ...terminalPanes];
}
