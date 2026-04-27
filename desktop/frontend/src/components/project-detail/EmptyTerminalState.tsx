import { PencilIcon, TerminalIcon } from "../icons";

interface EmptyTerminalStateProps {
  projectName: string;
  onNewTerminal: () => void;
  onEditConfig: () => void;
}

// Shown when a stopped project has no persisted terminal tabs. Offers
// the two natural starting points: spawn a fresh terminal or open the
// config editor.
export function EmptyTerminalState({ projectName, onNewTerminal, onEditConfig }: EmptyTerminalStateProps) {
  return (
    <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-hover)] text-[var(--text-muted)]">
          <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">No active terminals</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Open a terminal to start working on {projectName}, or edit the project config.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNewTerminal}
            className="flex items-center gap-2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-85"
          >
            <TerminalIcon />
            New Terminal
            <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
          </button>
          <button
            onClick={onEditConfig}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PencilIcon />
            Edit Config
            <kbd className="ml-1 text-[10px] opacity-70">⌘E</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
