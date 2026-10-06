import type { Terminal } from "@xterm/xterm";
import type { SerializeAddon } from "@xterm/addon-serialize";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { copyTerminalSelection } from "./copySelection";
import { copyConsole, saveConsole, type ConsoleFilter } from "./consoleActions";
import { chordLabel } from "../../keys";
import { isMac } from "../../platform";

interface ConsoleContextMenuProps {
  x: number;
  y: number;
  term: Terminal;
  serialize: SerializeAddon | null;
  canPaste: boolean;
  filter?: ConsoleFilter | null;
  // The running app holds the selection (mouse-owning TUIs); Copy asks it to
  // copy instead of reading the terminal's own (empty) selection.
  appCopyAvailable?: boolean;
  onAppCopy?: () => void;
  onClear: () => void;
  onPaste?: () => void;
  onClose: () => void;
}

export function ConsoleContextMenu({
  x,
  y,
  term,
  serialize,
  canPaste,
  filter,
  appCopyAvailable,
  onAppCopy,
  onClear,
  onPaste,
  onClose,
}: ConsoleContextMenuProps) {
  const hasSelection = term.hasSelection();
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        label="Copy"
        shortcut={chordLabel({ key: "c", meta: true })}
        disabled={!hasSelection && !appCopyAvailable}
        onClick={run(() => {
          if (hasSelection) copyTerminalSelection(term, serialize);
          else onAppCopy?.();
        })}
      />
      {canPaste && onPaste && (
        <ContextMenuItem label="Paste" shortcut={chordLabel({ key: "v", meta: true })} onClick={run(onPaste)} />
      )}
      <ContextMenuItem
        label="Select All"
        shortcut={chordLabel({ key: "a", meta: true })}
        onClick={run(() => term.selectAll())}
      />
      <div className="my-1 h-px bg-[var(--border)]" />
      <ContextMenuItem
        label="Clear console"
        shortcut={isMac ? "⌃L" : "Ctrl+L"}
        onClick={run(onClear)}
      />
      <div className="my-1 h-px bg-[var(--border)]" />
      <ContextMenuItem
        label="Copy console"
        onClick={run(() => void copyConsole(term, filter))}
      />
      <ContextMenuItem
        label="Save as..."
        onClick={run(() => void saveConsole(term, filter))}
      />
    </ContextMenuShell>
  );
}
