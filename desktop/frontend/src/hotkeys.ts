import { canonicalShortcut, parseShortcut } from "./shortcutParse";
import { isMac } from "./platform";

export type HotkeyId =
  | "toggleAgentOverview"
  | "tabSwitchNext"
  | "tabSwitchPrev"
  | "renameProject"
  | "deleteProject";

export interface HotkeyDef {
  id: HotkeyId;
  label: string;
  description: string;
  default: string;
}

const MAC_HOTKEYS: HotkeyDef[] = [
  {
    id: "toggleAgentOverview",
    label: "Activity",
    description: "Open Activity or return to the selected project",
    default: "cmd+shift+a",
  },
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
  {
    id: "renameProject",
    label: "Rename project",
    description: "Rename the project or duplicate selected in the sidebar",
    default: "cmd+r",
  },
  {
    id: "deleteProject",
    label: "Delete project",
    description: "Remove the project or duplicate selected in the sidebar, after a confirmation",
    default: "cmd+shift+backspace",
  },
];

// Ctrl+Alt+arrows switch workspaces on Linux desktops (and rotate the screen on
// some Windows drivers), so tabs step with Ctrl+PageDown / PageUp there.
const PC_DEFAULTS: Partial<Record<HotkeyId, string>> = {
  tabSwitchNext: "cmd+pagedown",
  tabSwitchPrev: "cmd+pageup",
};

export function hotkeyDefs(mac: boolean = isMac): HotkeyDef[] {
  if (mac) return MAC_HOTKEYS;
  return MAC_HOTKEYS.map((def) => ({ ...def, default: PC_DEFAULTS[def.id] ?? def.default }));
}

export const HOTKEYS: HotkeyDef[] = hotkeyDefs();

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
