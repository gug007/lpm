import { SlidersHorizontal } from "lucide-react";
import { closeRowLayoutDialog, openRowLayoutDialog, useRowLayoutDialog } from "../store/rowLayoutDialog";

/** The Projects header's way into the Row builder; pressed while it's open. */
export function SidebarRowLayoutButton() {
  const open = useRowLayoutDialog((s) => s.open);
  return (
    <button
      type="button"
      onClick={open ? closeRowLayoutDialog : openRowLayoutDialog}
      aria-pressed={open}
      aria-label="Customize project rows"
      title="Customize project rows"
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
        open ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"
      }`}
    >
      <SlidersHorizontal size={13} strokeWidth={2} />
    </button>
  );
}
