import { useEffect, useRef } from "react";
import { VoiceToTextAvailable } from "../../bridge/commands";

const CHECK_MS = 2000;

/** While `watching`, looks for VoiceToText in Applications every couple of
 *  seconds and calls `onFound` once it's there. */
export function useVoiceToTextWatch(watching: boolean, onFound: () => void): void {
  const found = useRef(onFound);
  found.current = onFound;

  useEffect(() => {
    if (!watching) return;
    let stopped = false;
    const check = async () => {
      const there = await VoiceToTextAvailable().catch(() => false);
      if (there && !stopped) {
        stopped = true;
        found.current();
      }
    };
    const timer = window.setInterval(() => void check(), CHECK_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [watching]);
}
