import { useEffect, useState } from "react";

// A clock that only ticks while `active`, for elapsed-time labels that must
// stay fresh without re-rendering idle views.
export function useNow(active: boolean, intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
