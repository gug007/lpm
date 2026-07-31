import { toneColor, type StatusTone } from "../../peer/peerStatus";

// The one way a machine's state is written in this pane: a colored dot and a
// sentence. `detail` carries the original message when the sentence is a
// rewrite of it, so the raw text is a hover away when it matters.
export function StatusLine({
  tone,
  text,
  detail = "",
  note = "",
  className = "text-[11px]",
}: {
  tone: StatusTone;
  text: string;
  detail?: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={detail || undefined}>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: toneColor(tone) }}
      />
      <span className="truncate text-[var(--text-muted)]">
        {text}
        {note}
      </span>
    </div>
  );
}
