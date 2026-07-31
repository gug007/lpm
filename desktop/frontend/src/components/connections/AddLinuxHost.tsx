import { useState } from "react";
import { PeerAddSshHost } from "../../../bridge/commands";
import { parseSshTarget, defaultAlias } from "../../peer/sshTarget";
import { Row } from "./GroupedList";

const FIELD_CLASS =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]";

// Adding a server is one field, because the user already has exactly one string
// for it: what they type after `ssh`. Everything else — installing lpm there,
// getting an invite out of it, forwarding its port — is work lpm can do with that
// string, and asking them to do it by hand is asking them to move a pairing secret
// through a clipboard.
export function AddLinuxHost({ refresh }: { refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [install, setInstall] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = parseSshTarget(value);

  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await PeerAddSshHost(target, defaultAlias(target), install);
      await refresh();
      setValue("");
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Row>
        <button
          onClick={() => setOpen(true)}
          className="text-[13px] text-[var(--accent-cyan)] transition-opacity hover:opacity-80"
        >
          Add a Linux host…
        </button>
      </Row>
    );
  }

  return (
    <>
      <Row className="flex-wrap">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="user@server"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={`${FIELD_CLASS} min-w-0 flex-1`}
        />
        <button
          onClick={() => void submit()}
          disabled={!target || busy}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            target && !busy
              ? "bg-[var(--accent-cyan)] text-white hover:opacity-90"
              : "bg-[var(--bg-active)] text-[var(--text-muted)]"
          }`}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </Row>
      <Row>
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={install}
            onChange={(e) => setInstall(e.target.checked)}
            className="accent-[var(--accent-cyan)]"
          />
          Install lpm on the server if it isn't there yet
        </label>
      </Row>
      {busy && (
        <Row>
          {/* This can take minutes on a small server: an apt install, a 16MB
              download, and a first launch that binds its port ~30s in. Saying so
              is the difference between waiting and force-quitting. */}
          <p className="text-[12px] text-[var(--text-muted)]">
            Setting up {target?.host ?? "the server"}. Installing can take a few minutes.
          </p>
        </Row>
      )}
      {error && (
        <Row>
          <p className="text-[12px] text-[var(--accent-red)]">{error}</p>
        </Row>
      )}
    </>
  );
}
