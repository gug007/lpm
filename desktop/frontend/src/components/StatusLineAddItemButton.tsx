import {
  STATUS_LINE_SEGMENT_DESCRIPTIONS,
  STATUS_LINE_SEGMENT_ICONS,
  STATUS_LINE_SEGMENT_LABELS,
} from "./statusLineEditorOptions";
import type { SegmentId } from "./statusLineTypes";

export function StatusLineAddItemButton({
  id,
  disabled,
  onClick,
}: {
  id: SegmentId;
  disabled: boolean;
  onClick: () => void;
}) {
  const label = STATUS_LINE_SEGMENT_LABELS[id];
  const description = STATUS_LINE_SEGMENT_DESCRIPTIONS[id];
  const customText = id === "text";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Add ${label} — ${description}`}
      title={description}
      className={`group inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 text-left outline-none transition-[border-color,background-color,color] hover:border-[var(--accent-green)]/45 hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40 ${
        customText
          ? "border-dashed border-[var(--border)] bg-transparent"
          : "border-[var(--border)] bg-[var(--bg-primary)]/50"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-4 w-4 shrink-0 items-center justify-center leading-none ${
          customText
            ? "font-mono text-[10px] font-semibold text-[var(--text-muted)]"
            : id === "model"
              ? "text-[12px] text-[#d97757]"
              : "text-[12px]"
        }`}
      >
        {customText ? "T" : STATUS_LINE_SEGMENT_ICONS[id]}
      </span>
      <span className="truncate text-[10.5px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
        {label}
      </span>
    </button>
  );
}
