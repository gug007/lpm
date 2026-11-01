import { readyLabel, type ServiceReadyState } from "../../serviceReadyState";

const TONE = {
  waiting: "text-[var(--text-muted)]",
  starting: "text-[var(--accent-amber)]",
  notReady: "text-[var(--accent-red)]",
} as const;

// "Waiting for api", "Starting" or "Not ready" on a service's tab while its
// ready checks hold it; nothing once it is ready.
export function ServiceReadyBadge(state: ServiceReadyState) {
  const label = readyLabel(state);
  if (!label || !state.readiness) return null;
  return (
    <span
      title={label.title}
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium ${TONE[state.readiness]}`}
    >
      {state.readiness === "starting" && (
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {label.text}
    </span>
  );
}
