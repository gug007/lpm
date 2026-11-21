import type { KeepAwakeStatus } from "../keepAwake";

const LOOK: Record<KeepAwakeStatus, { label: string; text: string; dot: string }> = {
  off: {
    label: "Off",
    text: "text-[var(--text-muted)]",
    dot: "bg-current",
  },
  waiting: {
    label: "Waiting",
    text: "text-[var(--text-secondary)]",
    dot: "ring-[1.5px] ring-inset ring-[var(--accent-amber)]",
  },
  awake: {
    label: "Awake",
    text: "text-[var(--text-secondary)]",
    dot: "bg-[var(--accent-amber)]",
  },
  paused: {
    label: "Paused",
    text: "text-[var(--accent-red-text)]",
    dot: "bg-current",
  },
};

// Off, Waiting, Awake or Paused, beside the Keep awake menu's title, so the
// state reads without the sentence. Only the dot carries color: the cup and
// the drain bar already say "on" in amber.
export function KeepAwakeStatusPill({ status }: { status: KeepAwakeStatus }) {
  const look = LOOK[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap py-0.5 text-[10.5px] font-medium leading-[15px] ${look.text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
      {look.label}
    </span>
  );
}
