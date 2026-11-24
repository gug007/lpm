import { useMemo, useRef } from "react";
import { resolveHotkey, type HotkeyId, type HotkeysConfig } from "../hotkeys";
import { formatShortcut, parseShortcut } from "../shortcutParse";
import { useSettingsStore } from "../store/settings";
import { actionTakes } from "./useActionShortcuts";
import { useEventListener } from "./useEventListener";
import { useKeyboardShortcut, type KeyboardShortcut } from "./useKeyboardShortcut";

const ROW_ATTR = "data-project-row";

const MODIFIER_KEYS = new Set(["Meta", "Shift", "Alt", "Control", "CapsLock", "Fn"]);

const modalOpen = () => document.querySelector("[data-modal-overlay]") !== null;

function isPlainDelete(e: KeyboardEvent): boolean {
  return (
    (e.key === "Backspace" || e.key === "Delete") &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.shiftKey
  );
}

// xterm's input is a textarea too, but the terminal is where focus sits after
// picking a project, so it doesn't count as a text field here.
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLInputElement) return true;
  return target instanceof HTMLTextAreaElement && !target.closest(".xterm");
}

function hotkey(hotkeys: HotkeysConfig | undefined, id: HotkeyId) {
  const parsed = parseShortcut(resolveHotkey(hotkeys, id));
  return parsed ? { ...parsed, preventDefault: false } : null;
}

function cmdHotkey(hotkeys: HotkeysConfig | undefined, id: HotkeyId) {
  const parsed = hotkey(hotkeys, id);
  return parsed && { ...parsed, cmdOnly: true };
}

function useActionYieldingKey(
  shortcut: KeyboardShortcut | null,
  target: string | null,
  run: (name: string) => void,
) {
  useKeyboardShortcut(
    shortcut ?? [],
    (event, matched) => {
      if (!target || modalOpen() || actionTakes(matched)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) run(target);
    },
    shortcut !== null,
    true,
  );
}

// The hotkeys act on the open menu's row, else the selected project. All but
// rename are captured, so the focused terminal, field or editor never also acts
// on them. Duplicate and pin take ⌘ alone (⌃N steps through a shell's history),
// and an action already on their keys keeps them.
//
// A plain Delete acts on the row just clicked (or the open menu's row): picking
// a project hands focus to its terminal, so the click arms the row until the
// next key, click, or window blur. It never takes the key from a text field.
export function useSidebarProjectKeys({
  selected,
  menuTarget,
  onRename,
  onDuplicate,
  onTogglePin,
  onDelete,
}: {
  selected: string | null;
  menuTarget: string | null;
  onRename: (name: string) => void;
  onDuplicate: (name: string) => void;
  onTogglePin: (name: string) => void;
  onDelete: (name: string) => void;
}): {
  renameShortcut?: string;
  duplicateShortcut?: string;
  pinShortcut?: string;
  deleteShortcut?: string;
} {
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const rename = useMemo(() => hotkey(hotkeys, "renameProject"), [hotkeys]);
  const duplicate = useMemo(() => cmdHotkey(hotkeys, "duplicateProject"), [hotkeys]);
  const pin = useMemo(() => cmdHotkey(hotkeys, "pinProject"), [hotkeys]);
  const remove = useMemo(() => hotkey(hotkeys, "deleteProject"), [hotkeys]);
  const target = menuTarget ?? selected;

  useKeyboardShortcut(
    rename ?? [],
    (event) => {
      if (!target || modalOpen()) return;
      event.preventDefault();
      onRename(target);
    },
    rename !== null,
  );

  useActionYieldingKey(duplicate, target, onDuplicate);
  useActionYieldingKey(pin, target, onTogglePin);

  useKeyboardShortcut(
    remove ?? [],
    (event) => {
      if (!target || modalOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      onDelete(target);
    },
    remove !== null,
    true,
  );

  const armed = useRef<string | null>(null);
  useEventListener(
    "pointerdown",
    (e) => {
      const row = e.target instanceof Element ? e.target.closest(`[${ROW_ATTR}]`) : null;
      armed.current = row?.getAttribute(ROW_ATTR) ?? null;
    },
    window,
    true,
    true,
  );
  useEventListener("blur", () => {
    armed.current = null;
  });
  useEventListener(
    "keydown",
    (e) => {
      if (MODIFIER_KEYS.has(e.key)) return;
      const row = menuTarget ?? armed.current;
      armed.current = null;
      if (!row || !isPlainDelete(e) || modalOpen() || inTextField(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      onDelete(row);
    },
    window,
    true,
    true,
  );

  return {
    renameShortcut: rename ? formatShortcut(rename) : undefined,
    duplicateShortcut: duplicate ? formatShortcut(duplicate) : undefined,
    pinShortcut: pin ? formatShortcut(pin) : undefined,
    deleteShortcut: remove ? formatShortcut(remove) : undefined,
  };
}
