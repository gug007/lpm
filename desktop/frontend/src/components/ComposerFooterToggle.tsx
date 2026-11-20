import { chordLabel } from "../keys";
import { useComposerStore } from "../store/composer";
import { MessageIcon } from "./icons";

const TOGGLE_INPUT = chordLabel({ key: "i", meta: true });

// Shown in the footer while the message input is closed, and only when ⌘I
// would open one: the focused pane's active tab is a terminal.
export function ComposerFooterToggle({ projectName }: { projectName: string }) {
  const open = useComposerStore((s) => s.open);
  const target = useComposerStore((s) => s.active[projectName] ?? null);
  if (open || !target) return null;
  return (
    <button
      type="button"
      onClick={() => useComposerStore.getState().setOpen(true)}
      title={`Show input (${TOGGLE_INPUT})`}
      aria-label="Show message input"
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-[var(--composer-border)] bg-[var(--composer-surface)] text-[var(--composer-fg-secondary)] transition-all duration-100 hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)] active:scale-[0.97]"
    >
      <MessageIcon />
    </button>
  );
}
