import YAML from "yaml";
import type { LayerInfo, ZoneInfo, ZoneRows } from "../../types";
import { lpmYml } from "../seed/sample/lpm-yml";
import type { SeedAction, SeedLine, SeedProfile, SeedService } from "../seed/types";
import type { Project } from "./state";

// The project's config as lpm shows it: the file as last saved, or what lpm
// writes from the records every view reads.
export function configYaml(p: Project): string {
  return p.configText ?? `${YAML.stringify({ name: p.name, root: p.root })}${lpmYml(p.services, p.actions, p.profiles)}`;
}

type Raw = Record<string, unknown>;

const isMap = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
const strMap = (v: unknown) =>
  isMap(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : undefined;
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// lpm's order: entries with a position first, lowest first, then the rest by key.
function sorted(map: Raw): [string, unknown][] {
  const pos = (v: unknown) => (isMap(v) ? num(v.position) : undefined);
  return Object.entries(map).sort(([ka, a], [kb, b]) => {
    const pa = pos(a);
    const pb = pos(b);
    if (pa !== undefined && pb !== undefined) return pa - pb || byKey(ka, kb);
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return byKey(ka, kb);
  });
}

const TYPES: readonly SeedAction["type"][] = ["terminal", "background", "command"];

// Children take their parent's type, folder and environment unless they set
// their own, as lpm resolves a menu.
function parseAction(key: string, raw: unknown, prev: SeedAction | undefined, parent?: SeedAction): SeedAction {
  const spec: Raw = isMap(raw) ? raw : { cmd: String(raw ?? "") };
  const type = str(spec.type) ?? parent?.type ?? "";
  const env = strMap(spec.env);
  const action: SeedAction = {
    output: prev?.output,
    durationMs: prev?.durationMs,
    task: prev?.task,
    name: key,
    label: str(spec.label) || key,
    emoji: str(spec.emoji),
    color: str(spec.color),
    cmd: str(spec.cmd) ?? "",
    display: str(spec.display) ?? "",
    type: TYPES.find((t) => t === type) ?? "",
    confirm: spec.confirm === true,
    position: num(spec.position),
    layer: str(spec.layer),
    primary: str(spec.primary),
    reuse: spec.reuse === true,
    prompt: str(spec.prompt),
    cwd: str(spec.cwd) ?? parent?.cwd,
    env: parent?.env || env ? { ...parent?.env, ...env } : undefined,
  };
  if (isMap(spec.actions)) action.children = parseActions(spec.actions, prev?.children, action);
  return action;
}

function parseActions(raw: unknown, prev: SeedAction[] = [], parent?: SeedAction): SeedAction[] {
  if (!isMap(raw)) return [];
  return sorted(raw).map(([key, spec]) => parseAction(key, spec, prev.find((a) => a.name === key), parent));
}

// The deprecated terminals section is actions that open a terminal.
function parseTerminals(raw: unknown, prev: SeedAction[]): SeedAction[] {
  if (!isMap(raw)) return [];
  return sorted(raw).map(([key, spec]) => {
    const full: Raw = isMap(spec) ? spec : { cmd: String(spec ?? "") };
    return parseAction(key, { type: "terminal", ...full }, prev.find((a) => a.name === key));
  });
}

function startLog(cmd: string, port?: number): SeedLine[] {
  const log: SeedLine[] = [{ text: `$ ${cmd}`, color: "green", at: 0 }];
  if (port) log.push({ text: `Listening on http://localhost:${port}`, color: "cyan", at: 700 });
  return log;
}

// A service keeps the output it had while its command stays the same.
function parseServices(raw: unknown, prev: SeedService[]): SeedService[] {
  if (!isMap(raw)) return [];
  return Object.entries(raw).map(([name, value]): SeedService => {
    const spec: Raw = isMap(value) ? value : { cmd: String(value ?? "") };
    const cmd = str(spec.cmd) ?? "";
    const port = num(spec.port);
    const old = prev.find((s) => s.name === name && s.cmd === cmd);
    return {
      ...(old ?? { log: startLog(cmd, port) }),
      name,
      cmd,
      port,
      dependsOn: list(spec.dependsOn ?? spec.depends_on),
    };
  });
}

function parseProfiles(raw: unknown): SeedProfile[] {
  if (!isMap(raw)) return [];
  return Object.entries(raw).map(([name, services]) => ({ name, services: list(services) ?? [] }));
}

function parseLayers(raw: unknown): LayerInfo[] | undefined {
  if (!isMap(raw)) return undefined;
  return sorted(raw).map(([name, spec]) => ({
    name,
    label: isMap(spec) ? str(spec.label) : undefined,
    position: isMap(spec) ? num(spec.position) : undefined,
  }));
}

const ROWS: readonly ZoneRows[] = [1, 2, 3];

// Only an entry with rows declares a zone.
function parseZones(raw: unknown): ZoneInfo[] {
  if (!isMap(raw)) return [];
  return sorted(raw).flatMap(([name, spec]): ZoneInfo[] => {
    const rows = isMap(spec) ? ROWS.find((r) => r === spec.rows) : undefined;
    if (!isMap(spec) || !rows) return [];
    return [
      {
        name,
        label: str(spec.label) || name,
        rows,
        display: spec.display === "footer" ? "footer" : "header",
        position: num(spec.position),
        source: "project",
        layers: parseLayers(spec.layers),
        collapsed: spec.collapsed === true || undefined,
      },
    ];
  });
}

// A config edit, applied the way lpm reloads one: what the file leaves out is
// gone, and services and actions keep the output they had when their name
// survives.
export function applyConfigYaml(p: Project, content: string): void {
  const doc: unknown = YAML.parse(content);
  if (!isMap(doc)) return;
  p.configText = content;
  if (doc.label !== undefined) p.label = str(doc.label) || undefined;
  p.services = parseServices(doc.services, p.services);
  p.actions = [...parseActions(doc.actions, p.actions), ...parseTerminals(doc.terminals, p.actions)];
  p.profiles = parseProfiles(doc.profiles);
  p.zones = parseZones(doc.zones);
  for (const name of p.running) if (!p.services.some((s) => s.name === name)) p.running.delete(name);
}
