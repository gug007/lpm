import type { KeepAwakeStatus } from "../keepAwake";

const LOOK: Record<KeepAwakeStatus, { label: string; pill: string; dot: string }> = {
  off: {
    label: "Off",
    pill: "bg-[var(--bg-hover)] text-[var(--text-muted)]",
    dot: "bg-current",
  },
  waiting: {
    label: "Waiting",
    pill: "text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border)]",
    dot: "ring-[1.5px] ring-inset ring-current",
  },
  awake: {
    label: "Awake",
    pill: "bg-[var(--accent-amber)]/15 text-[var(--accent-amber-text)]",
    dot: "bg-current",
  },
  paused: {
    label: "Paused",
    pill: "bg-[var(--accent-red)]/15 text-[var(--accent-red-text)]",
    dot: "bg-current",
  },
};

// Off, Waiting, Awake or Paused, beside the Keep awake menu's title, so the
// state reads without the sentence.
export function KeepAwakeStatusPill({ status }: { status: KeepAwakeStatus }) {
  const look = LOOK[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full py-0.5 pl-[7px] pr-2 text-[10.5px] font-semibold leading-[15px] ${look.pill}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
      {look.label}
    </span>
  );
}
