import { useSyncExternalStore } from "react";
import { fleetElapsedLabel, type FleetRow } from "../fleetRows";

const TICK_MS = 1000;

const listeners = new Set<() => void>();
let clock = Date.now();
let timer: number | null = null;

function tick() {
  clock = Date.now();
  for (const listener of listeners) listener();
}

function start() {
  if (timer === null && !document.hidden) timer = window.setInterval(tick, TICK_MS);
}

function stop() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function onVisibility() {
  if (document.hidden) {
    stop();
  } else {
    tick();
    start();
  }
}

// One clock for the whole list, and only the elapsed labels subscribe to it, so
// a tick never re-renders the view. It stops while the window is hidden.
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    start();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    }
  };
}

const getSnapshot = () => clock;

export interface FleetElapsedProps {
  row: FleetRow;
}

export function FleetElapsed({ row }: FleetElapsedProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <span className="w-24 shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-[var(--text-muted)]">
      {fleetElapsedLabel(row, now)}
    </span>
  );
}
