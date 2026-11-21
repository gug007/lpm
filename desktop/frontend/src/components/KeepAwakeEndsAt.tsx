import { shortWhenLabel } from "../sendLater/time";

// What a time chip's tooltip says: when Keep awake would end, read as the
// tooltip opens so it isn't stale.
export function KeepAwakeEndsAt({ minutes, from }: { minutes: number; from?: number | null }) {
  const now = Date.now();
  return <>Until {shortWhenLabel(Math.max(from ?? now, now) + minutes * 60_000, now)}</>;
}
