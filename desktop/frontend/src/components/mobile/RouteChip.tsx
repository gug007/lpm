import { Check } from "lucide-react";

/** Whether a way in works right now: Ready while remote control is live. */
export function RouteChip({ state }: { state: "ready" | "starting" | "off" }) {
  if (state !== "ready") {
    return (
      <span className="px-1 text-[11px] text-[var(--text-muted)]">
        {state === "starting" ? "Starting…" : "Off"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: "color-mix(in srgb, var(--accent-green) 14%, transparent)",
        color: "var(--accent-green-text)",
      }}
    >
      <Check size={11} strokeWidth={2.5} />
      Ready
    </span>
  );
}
