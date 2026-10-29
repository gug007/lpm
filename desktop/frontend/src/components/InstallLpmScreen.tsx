import { useEffect, useRef, useState } from "react";
import { PeerAddSshHost, PeerState } from "../../bridge/commands";
import { parseSshTarget } from "../peer/sshTarget";
import type { PeerStateShape } from "../peer/usePeerState";
import { useAppStore } from "../store/app";
import { modalErrorTextClass, modalInputClass, modalInputDefaults } from "../forms/styles";

// The same one-field setup as Settings → Connections → Add a Linux host. Once
// the server is paired, the picker carries on to adding a project on it.
export function InstallLpmScreen() {
  const addProjectForPeer = useAppStore((s) => s.addProjectForPeer);
  const [value, setValue] = useState("");
  const [install, setInstall] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Backing out mid-install still pairs the server; it just shouldn't reopen
  // the picker afterwards.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const target = parseSshTarget(value);

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { slug } = (await PeerAddSshHost(target, "", install)) as { slug: string };
      const peer = ((await PeerState()) as PeerStateShape).peers.find((p) => p.slug === slug);
      if (mounted.current) addProjectForPeer(slug, peer?.alias || target.host, true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">Server</span>
        <input
          {...modalInputDefaults}
          autoFocus
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="user@server"
          className={modalInputClass}
        />
        <span className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {busy
            ? `Setting up ${target?.host ?? "the server"}. Installing can take a few minutes.`
            : "What you'd type after ssh. lpm installs and pairs itself there."}
        </span>
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={install}
          disabled={busy}
          onChange={(e) => setInstall(e.target.checked)}
          className="accent-[var(--accent-cyan)]"
        />
        Install lpm on the server if it isn't there yet
      </label>
      {error && <p className={modalErrorTextClass}>{error}</p>}
      <button
        onClick={() => void submit()}
        disabled={!target || busy}
        className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[13px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}
