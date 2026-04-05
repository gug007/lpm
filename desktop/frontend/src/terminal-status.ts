import { useSyncExternalStore } from "react";

type Listener = () => void;

const busyCounts = new Map<string, number>();
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setBusyTerminalCount(projectName: string, count: number): void {
  if ((busyCounts.get(projectName) ?? 0) === count) return;
  if (count === 0) {
    busyCounts.delete(projectName);
  } else {
    busyCounts.set(projectName, count);
  }
  listeners.forEach((l) => l());
}

export function useBusyTerminalCount(projectName: string): number {
  return useSyncExternalStore(
    subscribe,
    () => busyCounts.get(projectName) ?? 0,
    () => 0,
  );
}
