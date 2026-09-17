import { PlusIcon } from "./icons";
import { Tooltip } from "../ui/Tooltip";

export function AddTerminalButton({ onAddTerminal }: { onAddTerminal: () => void }) {
  return (
    <Tooltip content="New terminal  ·  ⌘T" side="bottom">
      <button
        onClick={onAddTerminal}
        aria-label="New terminal"
        className="ml-1.5 flex h-6 shrink-0 items-center justify-center rounded-md px-1.5 text-[var(--terminal-header-text)] transition-colors duration-150 hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)] [&>svg]:h-3.5 [&>svg]:w-3.5"
      >
        <PlusIcon />
      </button>
    </Tooltip>
  );
}
