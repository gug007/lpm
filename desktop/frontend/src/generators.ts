import { arrayMove } from "@dnd-kit/sortable";
import type {
  AICLI,
  Generator,
  GeneratorDraft,
  GeneratorType,
  GeneratorsConfig,
  GeneratorOverride,
} from "./types";
import { isAICLI } from "./types";
import { getSettings } from "./store/settings";
import type { ComposerAction } from "./store/composerActions";

export const DEFAULT_GENERATORS: Generator[] = [
  {
    id: "nextjs",
    label: "Next.js",
    icon: { type: "brand", value: "nextjs" },
    type: "ai",
    prompt:
      "Scaffold a new Next.js app in the current directory using create-next-app with the App Router, TypeScript, and Tailwind CSS. Initialize git with a sensible .gitignore, verify the dev server runs, and make an initial commit using conventional commits.",
    builtin: true,
  },
];

export function emptyGeneratorsConfig(): GeneratorsConfig {
  return { order: [], hiddenDefaults: [], overrides: {}, custom: [] };
}

// The CLI a new/edited generator starts on: the generator's own choice if set,
// else the global default from settings, else claude.
export function resolveInitialCli(preferred?: AICLI): AICLI {
  if (preferred) return preferred;
  const saved = getSettings().aiCli;
  return isAICLI(saved) ? saved : "claude";
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// Records persisted before generators gained a type/cli field (or hand-edited
// configs) get normalized on read: default to the "ai" type and drop an
// unrecognized cli so downstream code can trust the discriminant.
function coerceGenerator(g: Generator): Generator {
  const type: GeneratorType =
    (g as { type?: unknown }).type === "command" ? "command" : "ai";
  return { ...g, type, cli: isAICLI(g.cli) ? g.cli : undefined };
}

function sortByOrder(list: Generator[], order: string[]): Generator[] {
  const pos = new Map(order.map((id, i) => [id, i] as const));
  return [...list].sort((a, b) => {
    const pa = pos.get(a.id) ?? Number.POSITIVE_INFINITY;
    const pb = pos.get(b.id) ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });
}

export function resolveGenerators(cfg: GeneratorsConfig): Generator[] {
  const hidden = new Set(cfg.hiddenDefaults);
  const defaults = DEFAULT_GENERATORS.filter((g) => !hidden.has(g.id)).map((g) => {
    const o = cfg.overrides[g.id];
    return coerceGenerator(o ? { ...g, ...stripUndefined(o) } : g);
  });
  const custom = cfg.custom.map((g) => coerceGenerator({ ...g, builtin: false }));
  return sortByOrder([...defaults, ...custom], cfg.order);
}

export function applyReorder(
  resolved: Generator[],
  cfg: GeneratorsConfig,
  activeId: string,
  overId: string,
): GeneratorsConfig {
  const ids = resolved.map((g) => g.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return cfg;
  return { ...cfg, order: arrayMove(ids, from, to) };
}

export function applyHideDefault(cfg: GeneratorsConfig, id: string): GeneratorsConfig {
  if (cfg.hiddenDefaults.includes(id)) return cfg;
  return { ...cfg, hiddenDefaults: [...cfg.hiddenDefaults, id] };
}

export function applyRestoreDefault(cfg: GeneratorsConfig, id: string): GeneratorsConfig {
  return { ...cfg, hiddenDefaults: cfg.hiddenDefaults.filter((x) => x !== id) };
}

export function applyAddCustom(cfg: GeneratorsConfig, gen: GeneratorDraft): GeneratorsConfig {
  const record: Generator = { ...gen, id: crypto.randomUUID() };
  return { ...cfg, custom: [...cfg.custom, record] };
}

export function applyUpdateGenerator(
  cfg: GeneratorsConfig,
  id: string,
  patch: GeneratorOverride,
  isDefault: boolean,
): GeneratorsConfig {
  if (isDefault) {
    const merged: GeneratorOverride = { ...cfg.overrides[id], ...stripUndefined(patch) };
    return { ...cfg, overrides: { ...cfg.overrides, [id]: merged } };
  }
  return {
    ...cfg,
    custom: cfg.custom.map((g) => (g.id === id ? { ...g, ...stripUndefined(patch) } : g)),
  };
}

export function applyDeleteCustom(cfg: GeneratorsConfig, id: string): GeneratorsConfig {
  return {
    ...cfg,
    custom: cfg.custom.filter((g) => g.id !== id),
    order: cfg.order.filter((x) => x !== id),
  };
}

function isValidGenerator(g: unknown): g is Generator {
  if (!g || typeof g !== "object") return false;
  const r = g as Record<string, unknown>;
  const icon = r.icon as Record<string, unknown> | null;
  const validIcon =
    !!icon &&
    typeof icon === "object" &&
    (icon.type === "brand" || icon.type === "emoji" || icon.type === "image") &&
    typeof icon.value === "string";
  return (
    typeof r.id === "string" &&
    typeof r.label === "string" &&
    typeof r.prompt === "string" &&
    validIcon
  );
}

const isPlainObj = (v: unknown) => v != null && typeof v === "object" && !Array.isArray(v);

function isValidPromptAction(v: unknown): v is ComposerAction {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    !!r.id &&
    typeof r.label === "string" &&
    typeof r.instruction === "string" &&
    typeof r.enabled === "boolean" &&
    typeof r.icon === "string"
  );
}

export function normalizeGeneratorsConfig(raw: unknown): GeneratorsConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const result: GeneratorsConfig = {
    order: strArr(r.order),
    hiddenDefaults: strArr(r.hiddenDefaults),
    overrides: isPlainObj(r.overrides)
      ? (Object.fromEntries(
          Object.entries(r.overrides as Record<string, unknown>).filter(([, v]) => isPlainObj(v)),
        ) as GeneratorsConfig["overrides"])
      : {},
    custom: Array.isArray(r.custom) ? (r.custom.filter(isValidGenerator) as Generator[]) : [],
  };
  if (Array.isArray(r.promptActions)) {
    result.promptActions = r.promptActions.filter(isValidPromptAction);
  }
  return result;
}
