import { useCallback, useEffect, useMemo, useState } from "react";
import { KeepAwakeSet, KeepAwakeSetPrefs, KeepAwakeState, PeerInvoke } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import {
  KEEP_AWAKE_CHANGED,
  leftAt,
  readKeepAwake,
  type KeepAwakeChoice,
  type KeepAwakeMode,
  type KeepAwakePrefs,
  type KeepAwakeState as State,
} from "../keepAwake";
import { useSecondsClock } from "./useSecondsClock";

// Where a machine's Keep awake is read and changed: this one, or a connected one.
interface KeepAwakeSource {
  state: () => Promise<unknown>;
  set: (mode: KeepAwakeChoice, minutes?: number) => Promise<unknown>;
  setPrefs: (prefs: KeepAwakePrefs) => Promise<unknown>;
  subscribe: (callback: (payload: unknown) => void) => () => void;
}

const LOCAL: KeepAwakeSource = {
  state: () => KeepAwakeState(),
  set: (mode, minutes) => KeepAwakeSet(mode, minutes),
  setPrefs: (prefs) => KeepAwakeSetPrefs(prefs),
  subscribe: (callback) => EventsOn(KEEP_AWAKE_CHANGED, callback),
};

function peerSource(slug: string): KeepAwakeSource {
  return {
    state: () => PeerInvoke(slug, "keep_awake_state", {}),
    set: (mode, minutes) => PeerInvoke(slug, "keep_awake_set", { mode, minutes }),
    setPrefs: (prefs) => PeerInvoke(slug, "keep_awake_set_prefs", { prefs }),
    subscribe: (callback) =>
      EventsOn(`peer-evt-${slug}`, (event: { name?: string; payload?: unknown } | null) => {
        if (event?.name === KEEP_AWAKE_CHANGED) callback(event.payload);
      }),
  };
}

export interface KeepAwakeSession {
  /** Null until the machine answers, and for one whose lpm predates it. */
  state: State | null;
  /** When the set time or the after-agents countdown ends, on this clock. */
  endsAt: number | null;
  error: string | null;
  set: (mode: KeepAwakeMode, minutes?: number) => void;
  /** More minutes on the set time or the countdown that is running. */
  extend: (minutes: number) => void;
  setPrefs: (prefs: KeepAwakePrefs) => void;
}

/** Keep awake on this machine (`slug` null) or a connected one, kept live. */
export function useKeepAwakeSession(slug: string | null, enabled = true): KeepAwakeSession {
  const source = useMemo(() => (slug ? peerSource(slug) : LOCAL), [slug]);
  const [state, setState] = useState<State | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const take = useCallback((raw: unknown) => {
    const next = readKeepAwake(raw);
    if (!next) return;
    setState(next);
    setEndsAt(next.endsIn === null ? null : Date.now() + next.endsIn);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const takeLive = (raw: unknown) => {
      if (live) take(raw);
    };
    source.state().then(takeLive, () => {});
    const off = source.subscribe(takeLive);
    return () => {
      live = false;
      off();
    };
  }, [source, enabled, take]);

  const run = useCallback(
    (request: Promise<unknown>) => {
      setError(null);
      request.then(take, (err: unknown) => setError(String(err)));
    },
    [take],
  );

  return {
    state,
    endsAt,
    error,
    set: useCallback((mode, minutes) => run(source.set(mode, minutes)), [run, source]),
    extend: useCallback((minutes) => run(source.set("extend", minutes)), [run, source]),
    setPrefs: useCallback((prefs) => run(source.setPrefs(prefs)), [run, source]),
  };
}

/** What is left of a countdown, re-read each second while one runs. The time is
 *  read here rather than taken from the tick, which can predate `endsAt`. */
export function useKeepAwakeLeft(endsAt: number | null): number | null {
  useSecondsClock(endsAt === null);
  return leftAt(endsAt, Date.now());
}
