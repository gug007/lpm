import { useCallback, useEffect, useState } from "react";
import {
  TailnetSetEnabled,
  TailnetSignIn,
  TailnetSignOut,
  TailnetState as FetchTailnetState,
} from "../../bridge/commands";
import { BrowserOpenURL, EventsOn } from "../../bridge/runtime";
import { DEFAULT_TAILNET_STATE, type TailnetState } from "../tailnetStatus";

export type TailnetBusy = "toggle" | "signIn" | "signOut" | null;

export interface Tailnet {
  state: TailnetState;
  /** False until the first answer, so nothing reads as "Off" before then. */
  loaded: boolean;
  busy: TailnetBusy;
  failure: string | null;
  /** This pane opened a sign-in page that the user hasn't finished yet. */
  opened: boolean;
  setEnabled: (on: boolean) => Promise<void>;
  /** Turn on if needed and open the sign-in page when one is waiting. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Built-in Tailscale's state, kept live, and the actions on it. */
export function useTailnetState(): Tailnet {
  const [state, setState] = useState<TailnetState>(DEFAULT_TAILNET_STATE);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<TailnetBusy>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const take = useCallback((s: unknown) => {
    const next = { ...DEFAULT_TAILNET_STATE, ...(s as Partial<TailnetState>) };
    setState(next);
    setLoaded(true);
    if (next.state !== "needsLogin") setOpened(false);
    // A failed command's notice is stale once the node has moved on to a
    // state that answers it.
    if (next.state === "running" || next.state === "needsApproval" || next.authUrl) {
      setFailure(null);
    }
  }, []);

  useEffect(() => {
    FetchTailnetState()
      .then(take)
      .catch(() => {});
    const off = EventsOn("tailnet-changed", take);
    return () => {
      if (typeof off === "function") off();
    };
  }, [take]);

  const run = useCallback(
    async (kind: Exclude<TailnetBusy, null>, action: () => Promise<unknown>) => {
      setBusy(kind);
      setFailure(null);
      try {
        const s = { ...DEFAULT_TAILNET_STATE, ...((await action()) as Partial<TailnetState>) };
        take(s);
        return s;
      } catch (err) {
        setFailure(String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [take],
  );

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!on) setOpened(false);
      await run("toggle", () => TailnetSetEnabled(on));
    },
    [run],
  );

  const signIn = useCallback(async () => {
    const s = await run("signIn", TailnetSignIn);
    if (s?.state === "needsLogin" && s.authUrl) {
      BrowserOpenURL(s.authUrl);
      setOpened(true);
    }
  }, [run]);

  const signOut = useCallback(async () => {
    setOpened(false);
    await run("signOut", TailnetSignOut);
  }, [run]);

  return { state, loaded, busy, failure, opened, setEnabled, signIn, signOut };
}
