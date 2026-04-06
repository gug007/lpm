import type { StatusEntry } from "../types";

export function StatusPill({ entries }: { entries: StatusEntry[] }) {
  if (!entries || entries.length === 0) return null;

  const entry = entries[0];
  const isRunning = entry.value === "Running";
  const color = entry.color || (isRunning ? "var(--accent-cyan)" : "var(--text-muted)");

  if (!isRunning) return null;

  return (
    <span className="inline-flex items-center gap-[3px] mt-1 animate-[fadeIn_0.2s_ease-out]">
      <span className="block h-[3px] w-[3px] rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" style={{ backgroundColor: color }} />
      <span className="block h-[3px] w-[3px] rounded-full animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" style={{ backgroundColor: color }} />
      <span className="block h-[3px] w-[3px] rounded-full animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" style={{ backgroundColor: color }} />
    </span>
  );
}
