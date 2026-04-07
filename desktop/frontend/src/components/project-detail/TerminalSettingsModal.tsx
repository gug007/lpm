import { Modal } from "../ui/Modal";
import { type TerminalThemeName, terminalThemeNames, getTerminalThemeColors } from "../../terminal-themes";
import { CheckIcon, XIcon } from "../icons";
import { MinusIcon, PlusIcon } from "../terminal/icons";

interface TerminalSettingsModalProps {
  open: boolean;
  onClose: () => void;
  fontSize: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  terminalTheme: TerminalThemeName;
  onTerminalThemeChange: (theme: TerminalThemeName) => void;
}

export function TerminalSettingsModal({
  open,
  onClose,
  fontSize,
  onZoomIn,
  onZoomOut,
  terminalTheme,
  onTerminalThemeChange,
}: TerminalSettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Terminal Settings</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Font Size
            </h3>
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-2.5">
              <button
                onClick={onZoomOut}
                className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <MinusIcon />
              </button>
              <span className="min-w-[2rem] text-center font-mono text-sm tabular-nums text-[var(--text-primary)]">
                {fontSize}
              </span>
              <button
                onClick={onZoomIn}
                className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Terminal Theme
            </h3>
            <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
              {terminalThemeNames.map((name) => {
                const colors = getTerminalThemeColors(name);
                const selected = terminalTheme === name;
                return (
                  <button
                    key={name}
                    onClick={() => onTerminalThemeChange(name)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
                      selected ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border)]"
                      style={{ background: colors?.bg ?? "var(--terminal-bg)" }}
                    />
                    <span className="flex-1">{name === "default" ? "Default" : name}</span>
                    {selected && <CheckIcon />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
