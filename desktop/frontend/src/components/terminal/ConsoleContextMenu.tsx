import type { Terminal } from "@xterm/xterm";
import type { SerializeAddon } from "@xterm/addon-serialize";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { copyTerminalSelection } from "./copySelection";
import { copyConsole, saveConsole, type ConsoleFilter } from "./consoleActions";

interface ConsoleContextMenuProps {
  x: number;
  y: number;
  term: Terminal;
  serialize: SerializeAddon | null;
  canPaste: boolean;
  filter?: ConsoleFilter | null;
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
        shortcut="⌘C"
        disabled={!hasSelection}
        onClick={run(() => copyTerminalSelection(term, serialize))}
      />
      {canPaste && onPaste && (
        <ContextMenuItem label="Paste" shortcut="⌘V" onClick={run(onPaste)} />
      )}
      <ContextMenuItem
        label="Select All"
        shortcut="⌘A"
        onClick={run(() => term.selectAll())}
      />
      <div className="my-1 h-px bg-[var(--border)]" />
      <ContextMenuItem
        label="Clear console"
        shortcut="⌃L"
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
