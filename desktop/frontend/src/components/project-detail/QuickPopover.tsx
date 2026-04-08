import { useOutsideClick } from "../../hooks/useOutsideClick";
import type { ActionInfo, TerminalConfigInfo } from "../../types";
import { TrashIcon, RefreshIcon, TerminalIcon, PencilIcon, SettingsIcon } from "../icons";
import { PlayIcon } from "./icons";

interface QuickPopoverProps {
  actions: ActionInfo[];
  terminals: TerminalConfigInfo[];
  running: boolean;
  actionBusy: boolean;
  onClose: () => void;
  onRunAction: (action: ActionInfo) => void;
  onRunTerminal: (term: TerminalConfigInfo) => void;
  onEditConfig: () => void;
  onRestart: () => void;
  onRemove: () => void;
  onTerminalSettings: () => void;
}

export function QuickPopover({
  actions,
  terminals,
  running,
  actionBusy,
  onClose,
  onRunAction,
  onRunTerminal,
  onEditConfig,
  onRestart,
  onRemove,
  onTerminalSettings,
}: QuickPopoverProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);

  const handleRunAction = (action: ActionInfo) => {
    onRunAction(action);
    onClose();
  };

  const handleRunTerminal = (term: TerminalConfigInfo) => {
    onRunTerminal(term);
    onClose();
  };

  const handleEditConfig = () => {
    onEditConfig();
    onClose();
  };

  const handleTerminalSettings = () => {
    onTerminalSettings();
    onClose();
  };

  const handleRestart = () => {
    onRestart();
    onClose();
  };

  const handleRemove = () => {
    onRemove();
    onClose();
  };

  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
      {actions.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Actions
          </div>
          {actions.map((action) => (
            <button
              key={action.name}
              onClick={() => handleRunAction(action)}
              disabled={actionBusy}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              <span className="flex-1 font-mono truncate">{action.label}</span>
              <PlayIcon />
            </button>
          ))}
        </>
      )}
      {terminals.length > 0 && (
        <>
          {actions.length > 0 && <div className="my-1 border-t border-[var(--border)]" />}
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Terminals
          </div>
          {terminals.map((term) => (
            <button
              key={term.name}
              onClick={() => handleRunTerminal(term)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="flex-1 font-mono truncate">{term.label}</span>
              <TerminalIcon />
            </button>
          ))}
        </>
      )}
      {(actions.length > 0 || terminals.length > 0) && <div className="my-1 border-t border-[var(--border)]" />}
      <button
        onClick={handleEditConfig}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="flex-1 truncate">Edit Config</span>
        <PencilIcon />
      </button>
      <button
        onClick={handleTerminalSettings}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="flex-1 truncate">Terminal Settings</span>
        <SettingsIcon />
      </button>
      {running && (
        <button
          onClick={handleRestart}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <span className="flex-1 truncate">Restart</span>
          <RefreshIcon />
        </button>
      )}
      <div className="my-1 border-t border-[var(--border)]" />
      <button
        onClick={handleRemove}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="flex-1 truncate">Remove</span>
        <TrashIcon />
      </button>
    </div>
  );
}
