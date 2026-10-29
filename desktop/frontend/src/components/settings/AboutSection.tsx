import { useEffect, useState } from "react";
import { toast } from "../../notifications/toast";
import { GetVersion, UninstallApp } from "../../../bridge/commands";
import { MACHINE } from "../../machineWords";
import { isMac } from "../../platform";
import { openReleasePage } from "../../releasePage";
import { removeAppConfirmText } from "../../removeAppCopy";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_SECONDARY } from "../ui/buttons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { RemovingOverlay } from "./RemovingOverlay";
import { UpdatesSection } from "./UpdatesSection";

// This machine's lpm: its updates and removing it.
export function AboutSection() {
  const [version, setVersion] = useState("");
  const [showRemoveApp, setShowRemoveApp] = useState(false);
  const [removeAppData, setRemoveAppData] = useState(false);
  const [removingApp, setRemovingApp] = useState(false);

  useEffect(() => {
    GetVersion().then(setVersion);
  }, []);

  useEffect(() => {
    if (showRemoveApp) setRemoveAppData(false);
  }, [showRemoveApp]);

  const handleRemoveApp = async () => {
    setShowRemoveApp(false);
    setRemovingApp(true);
    try {
      await UninstallApp(removeAppData);
      // The app quits itself once removal is scheduled; the overlay stays up.
    } catch (err) {
      setRemovingApp(false);
      // Off macOS the app stays installed, so the backend always answers with
      // where to finish rather than quitting.
      if (isMac) toast.error(String(err));
      else toast.info(String(err), { duration: 15_000 });
    }
  };

  return (
    <>
      {removingApp && <RemovingOverlay />}

      <UpdatesSection version={version} />

      {version && (
        <SettingsSection title="About">
          <SettingsRow {...rowProps("general.version")}>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[var(--text-secondary)]">{version}</span>
              {version !== "dev" && (
                <button onClick={() => openReleasePage(version)} className={BTN_SECONDARY}>
                  Release notes
                </button>
              )}
            </div>
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection title="Uninstall">
        <SettingsRow {...rowProps("general.removeApp")}>
          <button
            onClick={() => setShowRemoveApp(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--accent-red)] transition-colors hover:bg-[var(--bg-active)]"
          >
            Remove
          </button>
        </SettingsRow>
      </SettingsSection>

      <ConfirmDialog
        open={showRemoveApp}
        title="Remove lpm"
        variant="destructive"
        confirmLabel="Remove"
        body={
          isMac ? (
            <>
              <p>
                The app, its command line tool, and its agent skills will be
                removed from {MACHINE.thisMachine}. Your project folders won't be touched.
              </p>
              <label className="mt-4 flex cursor-pointer items-start gap-2 text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={removeAppData}
                  onChange={(e) => setRemoveAppData(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Also delete settings and project configurations
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    Removes every lpm setting, note, and project configuration.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <p>{removeAppConfirmText()}</p>
          )
        }
        onCancel={() => setShowRemoveApp(false)}
        onConfirm={handleRemoveApp}
      />
    </>
  );
}
