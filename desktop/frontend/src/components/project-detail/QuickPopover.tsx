import { useOutsideClick } from "../../hooks/useOutsideClick";
import type { ActionInfo, TerminalConfigInfo } from "../../types";
import { TrashIcon, RefreshIcon, TerminalIcon, PencilIcon, SettingsIcon } from "../icons";
import { PlayIcon } from "./icons";

const sectionLabelClass = "px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]";
const menuItemClass = "flex w-full items-center gap-2 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)]";

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
          <div className={sectionLabelClass}>Actions</div>
          {actions.map((action) =>
            action.children?.length ? (
              <div key={action.name}>
                {action.cmd ? (
                  <ActionMenuItem action={action} disabled={actionBusy} onClick={handleRunAction} />
                ) : (
                  <div className={sectionLabelClass}>{action.label}</div>
                )}
                {action.children.map((child) => (
                  <ActionMenuItem key={child.name} action={child} disabled={actionBusy} indented onClick={handleRunAction} />
                ))}
              </div>
            ) : (
              <ActionMenuItem key={action.name} action={action} disabled={actionBusy} onClick={handleRunAction} />
            )
          )}
        </>
      )}
      {terminals.length > 0 && (
        <>
          {actions.length > 0 && <div className="my-1 border-t border-[var(--border)]" />}
          <div className={sectionLabelClass}>Terminals</div>
          {terminals.map((term) => (
            <button
              key={term.name}
              onClick={() => handleRunTerminal(term)}
              className={`${menuItemClass} px-3 text-[var(--text-secondary)]`}
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
        className={`${menuItemClass} px-3 text-[var(--text-secondary)]`}
      >
        <span className="flex-1 truncate">Edit Config</span>
        <kbd className="ml-auto text-[10px] text-[var(--text-muted)]">⌘E</kbd>
      </button>
      <button
        onClick={handleTerminalSettings}
        className={`${menuItemClass} px-3 text-[var(--text-secondary)]`}
      >
        <span className="flex-1 truncate">Terminal Settings</span>
        <SettingsIcon />
      </button>
      {running && (
        <button
          onClick={handleRestart}
          className={`${menuItemClass} px-3 text-[var(--text-secondary)]`}
        >
          <span className="flex-1 truncate">Restart</span>
          <RefreshIcon />
        </button>
      )}
      <div className="my-1 border-t border-[var(--border)]" />
      <button
        onClick={handleRemove}
        className={`${menuItemClass} px-3 text-[var(--accent-red)]`}
      >
        <span className="flex-1 truncate">Remove</span>
        <TrashIcon />
      </button>
    </div>
  );
}

function ActionMenuItem({
  action,
  disabled,
  indented,
  onClick,
}: {
  action: ActionInfo;
  disabled: boolean;
  indented?: boolean;
  onClick: (action: ActionInfo) => void;
}) {
  return (
    <button
      onClick={() => onClick(action)}
      disabled={disabled}
      className={`${menuItemClass} ${indented ? "pl-5 pr-3" : "px-3"} text-[var(--text-secondary)] disabled:opacity-50`}
    >
      <span className="flex-1 font-mono truncate">{action.label}</span>
      <PlayIcon />
    </button>
  );
}
