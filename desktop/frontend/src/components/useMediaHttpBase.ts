import { useEffect, useState } from "react";
import { MediaHttpBase } from "../../bridge/commands";
import { isLinux } from "../platform";

let pending: Promise<string | null> | null = null;

function loadBase(): Promise<string | null> {
  pending ??= MediaHttpBase().then(
    (base) => (typeof base === "string" && base ? base : null),
    () => null,
  );
  return pending;
}

// Where Linux streams video from (see mediaSrc). Elsewhere there is nothing to
// wait for: `ready` is true and `base` null from the first render.
export function useMediaHttpBase(active: boolean): { base: string | null; ready: boolean } {
  const [base, setBase] = useState<string | null | undefined>(isLinux ? undefined : null);

  useEffect(() => {
    if (!active || base !== undefined) return;
    let live = true;
    void loadBase().then((value) => {
      if (live) setBase(value);
    });
    return () => {
      live = false;
    };
  }, [active, base]);

  return { base: base ?? null, ready: base !== undefined };
}
