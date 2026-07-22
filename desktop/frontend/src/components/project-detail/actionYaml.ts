import YAML from "yaml";
import type { ActionInfo, ActionPortConflict } from "../../types";
import type { RunMode } from "./actionInference";

// Fields the wizard form surfaces and writes on its own. Anything outside this
// set (env, inputs, depends_on, hand-authored keys) is "unmanaged": the form
// can't edit it, so it must ride along untouched through edits and round-trips.
export const MANAGED_ACTION_KEYS = new Set<string>([
  "label",
  "emoji",
  "color",
  "shortcut",
  "cmd",
  "cwd",
  "type",
  "reuse",
  "confirm",
  "port",
  "portConflict",
  "display",
  "actions",
  "position",
]);

export function unmanagedActionKeys(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  if (!payload) return [];
  return Object.keys(payload)
    .filter((key) => !MANAGED_ACTION_KEYS.has(key))
    .sort();
}

// The unmanaged-only slice of a payload, keyed in stable (sorted) order.
export function pickUnmanaged(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload) return out;
  for (const key of unmanagedActionKeys(payload)) out[key] = payload[key];
  return out;
}

function unmanagedSignature(
  payload: Record<string, unknown> | null | undefined,
): string {
  return unmanagedActionKeys(payload)
    .map((key) => `${key}=${JSON.stringify((payload as Record<string, unknown>)[key])}`)
    .join("\n");
}

// True when the two payloads carry different unmanaged fields. Drives the save
// path: a form save must fall back to a whole-payload write only when the user
// changed env/inputs/etc. in the editor before switching to the form.
export function unmanagedFieldsChanged(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  return unmanagedSignature(a) !== unmanagedSignature(b);
}

export function toRunMode(type: string | undefined): RunMode {
  return type === "terminal" || type === "command" || type === "background"
    ? type
    : "once";
}

const PORT_CONFLICT_POLICIES = new Set<ActionPortConflict>(["ask", "free", "fail"]);

function toPortArray(value: unknown): number[] | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) {
    const nums = value.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    return nums.length ? nums : undefined;
  }
  return undefined;
}

function toPortConflict(value: unknown): ActionPortConflict | undefined {
  return typeof value === "string" &&
    PORT_CONFLICT_POLICIES.has(value as ActionPortConflict)
    ? (value as ActionPortConflict)
    : undefined;
}

function yamlChildMapToList(actions: unknown): ActionInfo[] | undefined {
  if (!actions || typeof actions !== "object" || Array.isArray(actions))
    return undefined;
  const out: ActionInfo[] = [];
  for (const [name, value] of Object.entries(
    actions as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    out.push({
      name,
      label: typeof v.label === "string" ? v.label : name,
      cmd: typeof v.cmd === "string" ? v.cmd : "",
      cwd: typeof v.cwd === "string" ? v.cwd : undefined,
      confirm: Boolean(v.confirm),
      display: "",
      type: typeof v.type === "string" ? v.type : undefined,
      reuse: Boolean(v.reuse),
    });
  }
  return out.length ? out : undefined;
}

// Coerces a parsed action mapping into the ActionInfo shape so the form can
// re-use actionToDraft. Unknown fields are dropped from the ActionInfo (the
// form only surfaces what it understands); the caller keeps the raw payload
// separately to preserve them.
export function actionInfoFromPayload(obj: Record<string, unknown>): ActionInfo {
  return {
    name: "",
    label: typeof obj.label === "string" ? obj.label : "",
    emoji: typeof obj.emoji === "string" ? obj.emoji : undefined,
    color: typeof obj.color === "string" ? obj.color : undefined,
    shortcut: typeof obj.shortcut === "string" ? obj.shortcut : undefined,
    cmd: typeof obj.cmd === "string" ? obj.cmd : "",
    cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
    port: toPortArray(obj.port),
    portConflict: toPortConflict(obj.portConflict),
    confirm: Boolean(obj.confirm),
    display: typeof obj.display === "string" ? obj.display : "header",
    type: typeof obj.type === "string" ? obj.type : undefined,
    reuse: Boolean(obj.reuse),
    children: yamlChildMapToList(obj.actions),
  };
}

// Parses editor/AI YAML into ActionInfo. Throws if the document isn't a mapping
// so callers can surface the error instead of silently discarding the content.
export function yamlToActionInfo(yaml: string): ActionInfo {
  const parsed = YAML.parse(yaml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("YAML must be a mapping of action fields");
  }
  return actionInfoFromPayload(parsed as Record<string, unknown>);
}

// Maps a reordered list of ids back onto the item array, preserving object
// identity. Ids missing from the order are appended in their original order.
export function reorderById<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set(orderedIds);
  const out: T[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) out.push(item);
  }
  for (const item of items) if (!seen.has(item.id)) out.push(item);
  return out;
}
