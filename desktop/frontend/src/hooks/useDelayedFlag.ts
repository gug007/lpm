import { useEffect, useState } from "react";

// `on`, but only once it has stayed on for `ms` — so a state that usually
// passes in a blink (a warm model loading) never flashes on screen. With no
// wait to make, it's simply `on`.
export function useDelayedFlag(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const id = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on && (shown || ms <= 0);
}
