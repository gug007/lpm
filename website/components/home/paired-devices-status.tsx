import { FAINT, ORANGE } from "@/components/home/paired-devices-data";

// Claude Code's spinner row, shown under the transcript while the agent works.
export function DeviceStatus({ working }: { working: boolean }) {
  if (!working) return null;
  return (
    <div className="mt-5 whitespace-pre">
      <span className={ORANGE}>✻ Pondering… </span>
      <span className={FAINT}>(34s · ↓ 1.8k tokens)</span>
    </div>
  );
}
