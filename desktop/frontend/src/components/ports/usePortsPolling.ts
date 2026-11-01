import { useEffect } from "react";
import { useListeningPorts } from "../../store/listeningPorts";

// Reads the ports now and every `everyMs` after, skipping reads while the
// window is hidden (nobody is looking, and each read runs lsof and ps) or the
// last one hasn't answered yet (a slow paired computer can take longer than a tick).
export function usePortsPolling(everyMs: number, enabled = true): void {
  const load = useListeningPorts((s) => s.load);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible" && !useListeningPorts.getState().loading) void load();
    };
    tick();
    const id = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load, everyMs, enabled]);
}
