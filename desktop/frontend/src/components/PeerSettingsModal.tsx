import { useEffect, useState } from "react";
import { PeerSettingsGet, PeerSettingsSet } from "../../bridge/commands";
import { modalErrorBannerClass } from "../forms/styles";
import { MACHINE } from "../machineWords";
import { rowProps } from "../settings-registry";
import { RemoteFolderBrowserModal } from "./RemoteFolderBrowserModal";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { Modal } from "./ui/Modal";
import { Toggle } from "./ui/Toggle";

// The few settings a paired machine shares (peersettings.rs). A field it has
// never set comes back missing and reads as the same default this Mac's own
// Settings shows for it.
interface HostSettings {
  defaultProjectDirectory?: string | null;
  checkOrigin?: boolean;
  doubleClickToToggle?: boolean;
}

// A paired machine's own settings, changed from here. Everything else in
// Settings is how this Mac shows things, so it stays in this Mac's Settings.
export function PeerSettingsModal({
  open,
  slug,
  alias,
  headless,
  supported,
  onClose,
}: {
  open: boolean;
  slug: string;
  alias: string;
  /// Nobody sits at it, so it has no sidebar of its own to configure.
  headless: boolean;
  /// Its lpm shares its settings; an older one has to be updated first.
  supported: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<HostSettings | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // The folder browser takes this dialog's place rather than stacking on it,
  // so Escape there closes only the browser.
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    setSettings(null);
    setError("");
    setBrowsing(false);
    if (!open || !supported) return;
    let cancelled = false;
    PeerSettingsGet(slug)
      .then((value) => {
        if (!cancelled) setSettings((value ?? {}) as HostSettings);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, supported, slug, attempt]);

  // Shown as changed at once; the machine's answer is what it actually stored.
  const save = async (patch: HostSettings) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    setError("");
    try {
      setSettings(((await PeerSettingsSet(slug, patch)) ?? {}) as HostSettings);
    } catch (err) {
      setSettings(before);
      setError(String(err));
    }
  };

  const directory = settings?.defaultProjectDirectory || "";

  const body = (() => {
    if (!supported)
      return (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {alias} runs an older lpm that can&rsquo;t share its settings. Update it, then open
          this again.
        </p>
      );
    if (!settings && error)
      return (
        <div className="mt-4 space-y-3">
          <p className={modalErrorBannerClass}>Couldn&rsquo;t read its settings — {error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={BTN_SECONDARY}>
            Try Again
          </button>
        </div>
      );
    if (!settings)
      return <p className="mt-4 text-[12px] text-[var(--text-muted)]">Loading…</p>;
    return (
      <>
        <SettingsSection>
          {!headless && (
            <SettingsRow {...rowProps("general.doubleClick")}>
              <Toggle
                aria-label="Double-click to start/stop"
                enabled={settings.doubleClickToToggle ?? false}
                onChange={(v) => void save({ doubleClickToToggle: v })}
              />
            </SettingsRow>
          )}
          <SettingsRow {...rowProps("general.checkOrigin")}>
            <Toggle
              aria-label="Check for new commits"
              enabled={settings.checkOrigin ?? true}
              onChange={(v) => void save({ checkOrigin: v })}
            />
          </SettingsRow>
          <SettingsRow {...rowProps("general.defaultDir")}>
            <div className="flex items-center gap-2">
              <span
                className="max-w-[160px] truncate font-mono text-xs text-[var(--text-muted)]"
                title={directory || undefined}
              >
                {directory || "Not set"}
              </span>
              {directory && (
                <button
                  type="button"
                  onClick={() => void save({ defaultProjectDirectory: null })}
                  className={BTN_SECONDARY}
                >
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setBrowsing(true)} className={BTN_SECONDARY}>
                Choose
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>
        {error && <p className={`mt-3 ${modalErrorBannerClass}`}>{error}</p>}
      </>
    );
  })();

  return (
    <>
      <Modal
        open={open && !browsing}
        onClose={onClose}
        zIndexClassName="z-[60]"
        contentClassName="w-[460px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl"
      >
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Settings on {alias}
        </h3>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          These are saved on {alias} and apply to its projects. Theme, terminal, shortcuts and
          sounds stay in {MACHINE.thisMachine}&rsquo;s own Settings.
        </p>
        {body}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Done
          </button>
        </div>
      </Modal>
      <RemoteFolderBrowserModal
        open={open && browsing}
        slug={slug}
        alias={alias}
        title="Default project directory"
        confirmLabel="Choose"
        onChoose={(path) => {
          setBrowsing(false);
          void save({ defaultProjectDirectory: path });
        }}
        onClose={() => setBrowsing(false)}
      />
    </>
  );
}
