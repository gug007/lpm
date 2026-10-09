import { useEffect, useState, type ReactNode } from "react";
import { Grip } from "lucide-react";
import { RowMenu, type RowMenuItem } from "../connections/RowMenu";
import { WayInRow } from "./WayInRow";
import { RouteChip } from "./RouteChip";
import { PRIMARY_BUTTON, QUIET_BUTTON, SECONDARY_BUTTON, type TileTone } from "./styles";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { TAILSCALE_ADMIN_URL } from "../../tailnetStatus";
import type { Tailnet } from "../../hooks/useTailnetState";
import { MACHINE } from "../../machineWords";

interface RowView {
  tone: TileTone;
  badge?: string;
  subtitle: string;
  action?: ReactNode;
  menu: RowMenuItem[];
}

/** Built-in Tailscale as one of the ways in: a row that always says where it
 *  stands and offers the one next step, with a short setup panel under it. */
export function BuiltInTailscaleRow({
  tailnet,
  hasApp,
  live,
  deviceOnTailscale,
}: {
  tailnet: Tailnet;
  /** The Tailscale app runs on this machine, so built-in is optional. */
  hasApp: boolean;
  /** Remote control is up, so a connected node is a working way in. */
  live: boolean;
  /** A paired device has come in over Tailscale, so it knows the way. */
  deviceOnTailscale: boolean;
}) {
  const { state: s, busy, failure, opened, setEnabled, signIn, signOut } = tailnet;
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // A finished sign-in brings the node through "starting" once more on its
  // way to running: that is the sign-in completing, not setup starting over.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (s.state === "needsLogin") setSignedIn(true);
    else if (s.state !== "starting") setSignedIn(false);
  }, [s.state]);
  const finishing = s.enabled && signedIn && s.state === "starting";

  // Past sign-in (connected, waiting for an admin, refused) the setup steps
  // have nothing left to offer.
  const pastSignIn =
    s.enabled &&
    (finishing || ["running", "needsApproval", "stopped", "error"].includes(s.state) || (s.state === "off" && !!s.error));
  useEffect(() => {
    if (pastSignIn) setSetupOpen(false);
  }, [pastSignIn]);

  const signingIn = s.enabled && s.state === "needsLogin";
  const resuming = signingIn && opened;
  const showSetup = s.available && !pastSignIn && (setupOpen || signingIn);
  const turnOff: RowMenuItem = { label: "Turn off", onClick: () => void setEnabled(false) };
  const signOutItem: RowMenuItem = { label: "Sign out", onClick: () => void signOut(), destructive: true };
  const adminButton = (
    <button onClick={() => BrowserOpenURL(TAILSCALE_ADMIN_URL)} className={SECONDARY_BUTTON}>
      Open admin console
    </button>
  );

  const view = ((): RowView => {
    if (!s.available) {
      return { tone: "idle", subtitle: s.error ?? "Not available on this computer.", menu: [] };
    }
    if (!s.enabled) {
      return {
        tone: "idle",
        badge: hasApp ? undefined : "Recommended",
        subtitle: hasApp
          ? "Optional while the Tailscale app runs here"
          : `Reach ${MACHINE.thisMachine} from anywhere, no Tailscale app needed`,
        action: !showSetup && (
          <button onClick={() => setSetupOpen(true)} className={hasApp ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
            Set up
          </button>
        ),
        menu: [],
      };
    }
    if (finishing) return { tone: "idle", subtitle: "Finishing sign-in…", menu: [] };
    switch (s.state) {
      case "running":
        return {
          tone: "live",
          subtitle: [s.account, s.ip].filter(Boolean).join(" · ") || "Connected",
          action: <RouteChip state={live ? "ready" : "off"} />,
          menu: [
            ...(s.ip ? [{ label: "Copy address", onClick: () => void navigator.clipboard.writeText(s.ip ?? "") }] : []),
            turnOff,
            signOutItem,
          ],
        };
      case "needsLogin":
        return { tone: "warn", subtitle: "Waiting for you to sign in", menu: [] };
      case "needsApproval":
        return {
          tone: "warn",
          subtitle: `${s.account ? `${s.account} · ` : ""}approve ${s.deviceName || MACHINE.thisMachine} in the admin console`,
          action: adminButton,
          menu: [turnOff, signOutItem],
        };
      case "stopped":
        return { tone: "problem", subtitle: s.error ?? "Blocked by your Tailscale settings", action: adminButton, menu: [turnOff] };
      case "error":
        return retry(s.error);
      case "off":
        return s.error ? retry(s.error) : starting();
      default:
        return starting();
    }
  })();

  function retry(error: string | null): RowView {
    return {
      tone: "problem",
      subtitle: error ?? "Couldn't connect to Tailscale",
      action: (
        <button onClick={() => void setEnabled(true)} disabled={busy !== null} className={SECONDARY_BUTTON}>
          Try again
        </button>
      ),
      menu: [turnOff],
    };
  }

  function starting(): RowView {
    return {
      tone: "idle",
      subtitle: "Starting…",
      action: (
        <button onClick={() => void setEnabled(false)} disabled={busy !== null} className={QUIET_BUTTON}>
          Cancel
        </button>
      ),
      menu: [],
    };
  }

  const notNow = () => {
    setSetupOpen(false);
    if (s.enabled) void setEnabled(false);
  };

  const copyLink = async () => {
    if (!s.authUrl) return;
    await navigator.clipboard.writeText(s.authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const steps = [
    resuming
      ? "Finish signing in to Tailscale in your browser."
      : `Sign in to Tailscale on ${MACHINE.thisMachine}. It's free for personal use.`,
    "On your phone, sign in with the same account: lpm Link → Built-in Tailscale.",
    "Open lpm Link once on this Wi-Fi. It picks up the new address by itself.",
  ];

  return (
    <div data-settings-row="mobile.tailscale">
      <WayInRow
        icon={<Grip size={16} />}
        title="Built-in Tailscale"
        badge={view.badge}
        subtitle={view.subtitle}
        tone={view.tone}
      >
        {view.action}
        {view.menu.length > 0 && <RowMenu items={view.menu} ariaLabel="Built-in Tailscale options" />}
      </WayInRow>
      {showSetup && (
        <div className="px-4 pb-3.5 pl-16">
          <ol className="space-y-1.5">
            {steps.map((text, i) => (
              <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--bg-active)] text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {i + 1}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void signIn()} disabled={busy !== null} className={PRIMARY_BUTTON}>
              {busy === "signIn"
                ? "Opening Tailscale…"
                : resuming
                  ? "Open sign-in page again"
                  : "Sign in with Tailscale"}
            </button>
            {resuming && s.authUrl && (
              <button onClick={() => void copyLink()} className={SECONDARY_BUTTON}>
                {copied ? "Copied" : "Copy link"}
              </button>
            )}
            <button onClick={notNow} disabled={busy !== null} className={QUIET_BUTTON}>
              Not now
            </button>
          </div>
        </div>
      )}
      {s.enabled && s.state === "running" && !deviceOnTailscale && (
        <p className="px-4 pb-3 pl-16 text-[11px] leading-relaxed text-[var(--text-muted)]">
          On your phone, sign in to Built-in Tailscale in lpm Link with the same account. A phone
          paired before picks up this address the next time it opens on your network.
        </p>
      )}
      {failure && (
        <p className="px-4 pb-3 pl-16 text-[11px] leading-relaxed text-[var(--accent-red-text)]">{failure}</p>
      )}
    </div>
  );
}
