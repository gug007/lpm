import type { KeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { canonicalShortcut, parseShortcut, shortcutIdentity } from "./shortcutParse";
import { isMac } from "./platform";

export type HotkeyId =
  | "tabSwitchNext"
  | "tabSwitchPrev"
  | "paneFocusNext"
  | "paneFocusPrev"
  | "renameProject"
  | "duplicateProject"
  | "pinProject"
  | "deleteProject"
  | "dictate";

export interface HotkeyDef {
  id: HotkeyId;
  label: string;
  description: string;
  default: string;
}

const MAC_HOTKEYS: HotkeyDef[] = [
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
    id: "paneFocusNext",
    label: "Next pane",
    description: "Move the focus to the next pane",
    default: "cmd+alt+arrowdown",
  },
  {
    id: "paneFocusPrev",
    label: "Previous pane",
    description: "Move the focus to the previous pane",
    default: "cmd+alt+arrowup",
  },
  {
    id: "renameProject",
    label: "Rename project",
    description: "Rename the project or duplicate selected in the sidebar",
    default: "cmd+r",
  },
  {
    id: "duplicateProject",
    label: "Duplicate project",
    description: "Open the Duplicate dialog for the project selected in the sidebar",
    default: "cmd+n",
  },
  {
    id: "pinProject",
    label: "Pin project",
    description: "Keep the project selected in the sidebar at its top. Press again to unpin",
    default: "cmd+alt+p",
  },
  {
    id: "deleteProject",
    label: "Delete project",
    description: "Remove the project or duplicate selected in the sidebar, after a confirmation",
    default: "cmd+shift+backspace",
  },
  {
    id: "dictate",
    label: "Dictate",
    description: "Speak into the focused input or terminal with VoiceToText. Press again to insert",
    default: "cmd+alt+v",
  },
];

// VoiceToText is a macOS app, so dictation has no shortcut elsewhere.
const MAC_ONLY = new Set<HotkeyId>(["dictate"]);

// Ctrl+Alt+arrows switch workspaces on Linux desktops (and rotate the screen on
// some Windows drivers), so tabs step with Ctrl+PageDown / PageUp there, and
// panes with Ctrl+Shift+PageDown / PageUp.
const PC_DEFAULTS: Partial<Record<HotkeyId, string>> = {
  tabSwitchNext: "cmd+pagedown",
  tabSwitchPrev: "cmd+pageup",
  paneFocusNext: "cmd+shift+pagedown",
  paneFocusPrev: "cmd+shift+pageup",
};

export function hotkeyDefs(mac: boolean = isMac): HotkeyDef[] {
  if (mac) return MAC_HOTKEYS;
  return MAC_HOTKEYS.filter((def) => !MAC_ONLY.has(def.id)).map((def) => ({
    ...def,
    default: PC_DEFAULTS[def.id] ?? def.default,
  }));
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
  return typeof raw === "string" && raw ? raw : (HOTKEY_BY_ID.get(id)?.default ?? "");
}

function configuredShortcuts(cfg: HotkeysConfig | undefined, exceptId?: HotkeyId): KeyboardShortcut[] {
  return HOTKEYS.flatMap((def) => (def.id === exceptId ? [] : (parseShortcut(resolveHotkey(cfg, def.id)) ?? [])));
}

// Canonical combos already claimed by configurable hotkeys, so the recorder and
// the action-shortcut wizard keep them reserved. `exceptId` frees the row being
// edited from clashing with itself.
export function configuredHotkeyCombos(
  cfg: HotkeysConfig | undefined,
  exceptId?: HotkeyId,
): Set<string> {
  return new Set(configuredShortcuts(cfg, exceptId).map((shortcut) => canonicalShortcut(shortcut)));
}

// Whether one of the configurable hotkeys is set to this chord.
export function hotkeyTakes(cfg: HotkeysConfig | undefined, shortcut: KeyboardShortcut): boolean {
  const id = shortcutIdentity(shortcut);
  return configuredShortcuts(cfg).some((taken) => shortcutIdentity(taken) === id);
}
