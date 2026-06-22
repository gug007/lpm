import { useEffect, useState } from "react";
import { Loader2, Settings2, Sparkles } from "lucide-react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { composerActionIcon, type ComposerAction } from "../store/composerActions";

interface ComposerActionsButtonProps {
  // Enabled actions, in order. May be empty — the popover then offers setup.
  enabledActions: ComposerAction[];
  busy: boolean;
  // False when the input is empty, so actions show as unavailable.
  canRun: boolean;
  // The AI CLI/model the transforms run with, surfaced in tooltips.
  cliLabel: string;
  onRun: (action: ComposerAction) => void;
  onManage: () => void;
}

export function ComposerActionsButton({
  enabledActions,
  busy,
  canRun,
  cliLabel,
  onRun,
  onManage,
}: ComposerActionsButtonProps) {
  const [open, setOpen] = useState(false);
  // Boundary wraps both the trigger and the panel so clicking the trigger to
  // close doesn't read as an outside click (which would reopen on the click).
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  // Escape closes the popover first; captured so it doesn't also bubble to the
  // composer's Escape handler (which would refocus the terminal underneath).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const run = (action: ComposerAction) => {
    setOpen(false);
    onRun(action);
  };

  const manage = () => {
    setOpen(false);
    onManage();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="AI actions"
        aria-expanded={open}
        title={busy ? "Applying action…" : "AI actions"}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
          open
            ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={1.75} />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-60 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
          {enabledActions.length === 0 ? (
            <div className="px-3.5 py-4 text-center">
              <p className="text-[12px] text-[var(--text-muted)]">No actions enabled yet.</p>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1.5">
              {enabledActions.map((action) => {
                const Icon = composerActionIcon(action.icon);
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={() => run(action)}
                      disabled={!canRun}
                      title={canRun ? `${action.label} · runs with ${cliLabel}` : "Type something first"}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
                        <Icon size={14} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{action.label || "Untitled action"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={manage}
            className="flex w-full items-center gap-2.5 border-t border-[var(--border)] px-3.5 py-2.5 text-left text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Settings2 size={14} strokeWidth={1.75} />
            Manage actions
          </button>
        </div>
      )}
    </div>
  );
}
