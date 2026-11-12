"use client";

import { useSyncExternalStore } from "react";
import type { YouTubeLessonId } from "./youtube-lessons";

const STORAGE_KEY = "lpm-lessons-watched";
const NONE: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
let cached: ReadonlySet<string> | null = null;

function read(): ReadonlySet<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(ids) && ids.length
      ? new Set(ids.filter((id) => typeof id === "string"))
      : NONE;
  } catch {
    return NONE;
  }
}

function getSnapshot(): ReadonlySet<string> {
  return (cached ??= read());
}

function publish(watched: ReadonlySet<string>) {
  cached = watched;
  listeners.forEach((notify) => notify());
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) publish(read());
}

// The set in memory is only kept current while something is subscribed, so
// the first subscriber starts from storage again.
function subscribe(onChange: () => void): () => void {
  if (listeners.size === 0) {
    cached = null;
    window.addEventListener("storage", onStorage);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function write(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  publish(ids.length ? new Set(ids) : NONE);
}

export function markLessonWatched(lesson: YouTubeLessonId) {
  const watched = listeners.size ? getSnapshot() : read();
  if (!watched.has(lesson)) write([...watched, lesson]);
}

export function clearWatchedLessons() {
  write([]);
}

// Empty on the server and until hydration: the list lives only in this
// browser, so nothing about it can be in the page's HTML.
export function useWatchedLessons(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, () => NONE);
}
