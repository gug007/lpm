import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/app";
import { useListeningPorts } from "../../store/listeningPorts";

// A dev server binds its port a moment after it starts, so a read right away
// would miss it; one soon after and one later catch the quick and the slow.
const AFTER_MS = [1_500, 6_000];

// Reads the ports again when services start or stop anywhere, so the sidebar
// count follows a start instead of waiting for the next slow poll.
export function usePortsFollowProjects(): void {
  const running = useAppStore((s) =>
    s.projects
      .filter((p) => p.running)
      .map((p) => `${p.name}:${p.services.map((svc) => svc.name).join(",")}`)
      .join("|"),
  );
  const load = useListeningPorts((s) => s.load);
  const seen = useRef(running);
  useEffect(() => {
    if (seen.current === running) return;
    seen.current = running;
    const timers = AFTER_MS.map((ms) => setTimeout(() => void load(), ms));
    return () => timers.forEach(clearTimeout);
  }, [running, load]);
}
