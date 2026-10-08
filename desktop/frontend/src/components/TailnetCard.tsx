import { useCallback, useEffect, useState } from "react";
import { CheckIcon, CopyIcon, GlobeIcon } from "./icons";
import { Toggle } from "./connections/Toggle";
import { RemoteNotice } from "./RemoteNotice";
import {
  TailnetSetEnabled,
  TailnetSignIn,
  TailnetSignOut,
  TailnetState as FetchTailnetState,
} from "../../bridge/commands";
import { BrowserOpenURL, EventsOn } from "../../bridge/runtime";
import { REMOTE_TONE_STYLE } from "../remoteStatus";
import {
  DEFAULT_TAILNET_STATE,
  TAILSCALE_ADMIN_URL,
  tailnetView,
  type TailnetState,
} from "../tailnetStatus";
import { MACHINE } from "../machineWords";

type Busy = "toggle" | "signIn" | "signOut" | null;

const PRIMARY_BUTTON =
  "rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-60";
const QUIET_BUTTON =
  "shrink-0 rounded-md px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] disabled:opacity-60";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-60";

const SETUP_STEPS = [
  "Turn it on here and sign in with your Tailscale account (free for personal use).",
  "In lpm Link on your phone, tap “Away from home? Set up Built-in Tailscale” on the pairing screen — or Settings → Built-in Tailscale once paired — and sign in with the same account.",
  "Add your phone under Paired devices. A phone that's already paired picks up the new address the next time it connects on your Wi-Fi.",
];

/** Built-in Tailscale: puts this machine on the user's tailnet without the
 *  Tailscale app, so a phone reaches it from any network. */
export function TailnetCard() {
  const [state, setState] = useState<TailnetState>(DEFAULT_TAILNET_STATE);
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const take = useCallback((s: unknown) => {
    const next = { ...DEFAULT_TAILNET_STATE, ...(s as Partial<TailnetState>) };
    setState(next);
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
    async (kind: Exclude<Busy, null>, action: () => Promise<unknown>) => {
      setBusy(kind);
      setFailure(null);
      try {
        const s = (await action()) as Partial<TailnetState>;
        take(s);
        return { ...DEFAULT_TAILNET_STATE, ...s };
      } catch (err) {
        setFailure(String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [take],
  );

  const signIn = useCallback(async () => {
    const s = await run("signIn", TailnetSignIn);
    if (s?.state === "needsLogin" && s.authUrl) BrowserOpenURL(s.authUrl);
  }, [run]);

  const copyLink = useCallback(async () => {
    if (!state.authUrl) return;
    await navigator.clipboard.writeText(state.authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [state.authUrl]);

  const view = tailnetView(state);
  const tone = REMOTE_TONE_STYLE[view.tone];
  const live = view.tone === "live";

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="flex items-center gap-4 px-4 py-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: live
                ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
                : "var(--bg-active)",
              color: live ? "var(--accent-green)" : "var(--text-muted)",
            }}
          >
            <GlobeIcon />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Built-in Tailscale</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} />
              <span className="truncate" style={{ color: tone.text }}>
                {view.label}
              </span>
            </div>
          </div>
          {state.available && (
            <Toggle
              enabled={state.enabled}
              ariaLabel="Built-in Tailscale"
              disabled={busy !== null}
              onChange={(v) => void run("toggle", () => TailnetSetEnabled(v))}
            />
          )}
        </div>

        {view.step === "setUp" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
              Reach {MACHINE.thisMachine} from your phone over cellular or any network — no Tailscale
              app needed on either device.
            </p>
            <ol className="mt-3 space-y-1.5">
              {SETUP_STEPS.map((text, i) => (
                <li key={text} className="flex gap-2.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--bg-active)] text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => void signIn()} disabled={busy !== null} className={`mt-3 ${PRIMARY_BUTTON}`}>
              {busy === "signIn" ? "Opening Tailscale…" : "Set up"}
            </button>
          </div>
        )}

        {view.step === "signIn" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
              Sign in with your Tailscale account in the browser. {MACHINE.ThisMachine} joins your
              tailnet as <span className="font-medium text-[var(--text-secondary)]">{state.deviceName}</span>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => void signIn()} disabled={busy !== null} className={PRIMARY_BUTTON}>
                {busy === "signIn" ? "Opening Tailscale…" : "Sign in with Tailscale"}
              </button>
              {state.authUrl && (
                <button onClick={() => void copyLink()} className={SECONDARY_BUTTON}>
                  {copied ? <CheckIcon /> : <CopyIcon size={12} />}
                  {copied ? "Copied" : "Copy sign-in link"}
                </button>
              )}
            </div>
          </div>
        )}

        {view.step === "approve" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
              {state.account ? `Signed in as ${state.account}. ` : ""}Your tailnet asks an admin to
              approve new devices. Approve{" "}
              <span className="font-medium text-[var(--text-secondary)]">{state.deviceName}</span> in
              the Tailscale admin console and {MACHINE.thisMachine} connects on its own — or sign out
              to use a different account.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => BrowserOpenURL(TAILSCALE_ADMIN_URL)} className={SECONDARY_BUTTON}>
                Open admin console
              </button>
              <button
                onClick={() => void run("signOut", TailnetSignOut)}
                disabled={busy !== null}
                className={QUIET_BUTTON}
              >
                {busy === "signOut" ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        )}

        {view.step === "retry" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">{state.error}</p>
            <button
              onClick={() => void run("toggle", () => TailnetSetEnabled(true))}
              disabled={busy !== null}
              className={`mt-3 ${SECONDARY_BUTTON}`}
            >
              Try again
            </button>
          </div>
        )}

        {view.step === "blocked" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">{state.error}</p>
            <button onClick={() => BrowserOpenURL(TAILSCALE_ADMIN_URL)} className={`mt-3 ${SECONDARY_BUTTON}`}>
              Open admin console
            </button>
          </div>
        )}

        {live && (
          <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">Tailnet address</p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {state.dnsName || state.deviceName}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[12px] text-[var(--text-secondary)]">{state.ip}</span>
            </div>
            <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
              New pairings include this address. Phones paired before pick it up the next time they
              connect on your Wi-Fi. On the phone, set up Built-in Tailscale in lpm Link with the same
              account.
            </p>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                Signing out removes {MACHINE.thisMachine} from your tailnet.
              </p>
              <button
                onClick={() => void run("signOut", TailnetSignOut)}
                disabled={busy !== null}
                className={QUIET_BUTTON}
              >
                {busy === "signOut" ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        )}
      </div>

      {failure && <RemoteNotice tone={REMOTE_TONE_STYLE.problem}>{failure}</RemoteNotice>}

    </>
  );
}
