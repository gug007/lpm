import { StatusChip } from "../ui/StatusChip";

/** Whether a way in works right now: Ready while remote control is live. */
export function RouteChip({ state }: { state: "ready" | "starting" | "off" }) {
  if (state === "ready") {
    return (
      <StatusChip tone="success" dot>
        Ready
      </StatusChip>
    );
  }
  return <StatusChip>{state === "starting" ? "Starting…" : "Off"}</StatusChip>;
}
