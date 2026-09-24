import { Info, Undo2 } from "lucide-react";

export function StatusLineCustomNotice({
  layoutLabel,
  replaced,
  disabled,
  onAction,
}: {
  layoutLabel: string;
  replaced: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/8 px-3 py-2 text-[10.5px] leading-relaxed text-[var(--text-secondary)]"
    >
      <Info
        aria-hidden
        size={13}
        className="shrink-0 text-[var(--accent-blue-text)]"
      />
      <span className="min-w-0 flex-1">
        {replaced
          ? `Now editing your Custom line, made from ${layoutLabel}. Your earlier Custom line was replaced.`
          : `Changing an item turns ${layoutLabel} into your Custom line and replaces the one you saved.`}
      </span>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 font-medium text-[var(--accent-blue-text)] outline-none transition-colors hover:bg-[var(--accent-blue)]/10 focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-40"
      >
        {replaced ? (
          <>
            <Undo2 aria-hidden size={12} /> Restore my Custom line
          </>
        ) : (
          "Edit my Custom line instead"
        )}
      </button>
    </div>
  );
}
