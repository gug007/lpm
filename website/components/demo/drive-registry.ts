"use client";

// How the tour reaches something already on screen whose gesture is typing
// rather than a button — a composer, a shell's command line. Each mounted one
// registers a handle under a key the tour can name before it exists. The
// newest one under a key answers, and closing it hands the key back to the one
// opened before it.
export function createDriveRegistry<T>() {
  const drives = new Map<string, T[]>();

  const register = (key: string, drive: T): (() => void) => {
    drives.set(key, [...(drives.get(key) ?? []), drive]);
    return () => {
      const rest = (drives.get(key) ?? []).filter((d) => d !== drive);
      if (rest.length) drives.set(key, rest);
      else drives.delete(key);
    };
  };

  const get = (key: string): T | undefined => drives.get(key)?.at(-1);

  // A handle registers as its owner mounts, a render after whatever opened it,
  // so a call aimed at one that has only just opened waits for it — and, given
  // `ready`, for it to be in a state to take the call — rather than being
  // dropped. Returns a cancel.
  const withDrive = (
    key: string,
    fn: (drive: T) => void,
    ready?: (drive: T) => boolean,
  ): (() => void) => {
    let timer: number | null = null;
    let left = WAIT_TRIES;
    const attempt = () => {
      timer = null;
      const drive = get(key);
      if (drive && (ready?.(drive) ?? true)) return fn(drive);
      left -= 1;
      if (left > 0) timer = window.setTimeout(attempt, WAIT_MS);
    };
    attempt();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  };

  return { register, get, withDrive };
}

const WAIT_MS = 60;
const WAIT_TRIES = 25;
