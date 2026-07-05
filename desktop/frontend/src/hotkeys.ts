import { canonicalShortcut, parseShortcut } from "./shortcutParse";

export type HotkeyId = "tabSwitchNext" | "tabSwitchPrev";

export interface HotkeyDef {
  id: HotkeyId;
  label: string;
  description: string;
  default: string;
}

export const HOTKEYS: HotkeyDef[] = [
  {
    id: "tabSwitchNext",
    label: "Next tab",
    description: "Move to the next terminal or service in the pane",
    default: "cmd+alt+arrowright",
  },
  {
    id: "tabSwitchPrev",
    label: "Previous tab",
    description: "Move to the previous terminal or service in the pane",
    default: "cmd+alt+arrowleft",
  },
];

const HOTKEY_BY_ID = new Map(HOTKEYS.map((h) => [h.id, h]));

export type HotkeysConfig = Partial<Record<HotkeyId, string>>;

export function normalizeHotkeys(raw: unknown): HotkeysConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const out: HotkeysConfig = {};
  for (const def of HOTKEYS) {
    const v = obj[def.id];
    out[def.id] = typeof v === "string" && v ? v : def.default;
  }
  return out;
}

export function resolveHotkey(cfg: HotkeysConfig | undefined, id: HotkeyId): string {
  const raw = cfg?.[id];
  return typeof raw === "string" && raw ? raw : HOTKEY_BY_ID.get(id)!.default;
}

// Canonical combos already claimed by configurable hotkeys, so the recorder and
// the action-shortcut wizard keep them reserved. `exceptId` frees the row being
// edited from clashing with itself.
export function configuredHotkeyCombos(
  cfg: HotkeysConfig | undefined,
  exceptId?: HotkeyId,
): Set<string> {
  const out = new Set<string>();
  for (const def of HOTKEYS) {
    if (def.id === exceptId) continue;
    const parsed = parseShortcut(resolveHotkey(cfg, def.id));
    if (parsed) out.add(canonicalShortcut(parsed));
  }
  return out;
}
