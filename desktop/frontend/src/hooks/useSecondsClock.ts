import { useSyncExternalStore } from "react";

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

const noSubscribe = () => () => {};

/** One 1s clock for every elapsed label in the app, so a tick re-renders only
 *  the labels that subscribe — never the views around them. It stops entirely
 *  while the window is hidden, and while nothing is subscribed.
 *
 *  A label reading a value that has stopped changing passes `paused`, which
 *  unsubscribes it: once every label is paused the interval itself stops. */
export function useSecondsClock(paused = false): number {
  return useSyncExternalStore(paused ? noSubscribe : subscribe, getSnapshot);
}
