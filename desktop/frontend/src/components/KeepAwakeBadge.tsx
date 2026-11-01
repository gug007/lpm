import { type KeepAwakeSession, useKeepAwakeLeft } from "../hooks/useKeepAwakeSession";
import { keepAwakeBadge } from "../keepAwake";

// What the Keep awake row says at its end: how many agents hold it, or how long
// is left. Ticks only while a countdown runs.
export function KeepAwakeBadge({ session }: { session: KeepAwakeSession }) {
  const text = keepAwakeBadge(session.state, useKeepAwakeLeft(session.endsAt));
  if (!text) return null;
  return (
    <span
      className={`text-[10px] font-medium tabular-nums ${
        session.state?.active ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
      }`}
    >
      {text}
    </span>
  );
}
