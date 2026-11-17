import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "../../notifications/toast";
import { ExportConfig, ImportConfig, VaultExportKey, VaultImportKey } from "../../../bridge/commands";
import type { main } from "../../../bridge/models";
import { MACHINE } from "../../machineWords";
import { isMac } from "../../platform";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { BTN_PRIMARY, BTN_SECONDARY } from "../ui/buttons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ImportReportModal } from "./ImportReportModal";
import { PassphraseModal } from "./PassphraseModal";
import { Spinner } from "./Spinner";

export function BackupPane() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [showVaultExport, setShowVaultExport] = useState(false);
  const [showVaultImport, setShowVaultImport] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importReport, setImportReport] = useState<main.ImportReport | null>(null);

  useEffect(() => {
    if (showImportOptions) setImportOverwrite(false);
  }, [showImportOptions]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const path = await ExportConfig();
      if (path) toast.success(`Exported to ${path}`);
    } catch (err) {
      toast.error(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (overwrite: boolean) => {
    setShowImportOptions(false);
    if (importing) return;
    setImporting(true);
    try {
      const report = await ImportConfig(overwrite);
      if (report) setImportReport(report);
    } catch (err) {
      toast.error(`Import failed: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  const handleVaultExport = async (passphrase: string) => {
    setShowVaultExport(false);
    try {
      const path = await VaultExportKey(passphrase);
      if (path) toast.success(`Vault key exported to ${path}`);
    } catch (err) {
      toast.error(`Vault export failed: ${err}`);
    }
  };

  const handleVaultImport = async (passphrase: string) => {
    setShowVaultImport(false);
    try {
      await VaultImportKey(passphrase);
      toast.success("Vault key imported");
    } catch (err) {
      toast.error(`Vault import failed: ${err}`);
    }
  };

  return (
    <>
      <SettingsSection title="Projects and settings">
        <SettingsRow {...rowProps("backup.export")}>
          <button onClick={handleExport} disabled={exporting} className={BTN_SECONDARY}>
            {exporting ? <Spinner /> : "Export…"}
          </button>
        </SettingsRow>
        <SettingsRow {...rowProps("backup.import")}>
          <button onClick={() => setShowImportOptions(true)} disabled={importing} className={BTN_SECONDARY}>
            {importing ? <Spinner /> : "Import…"}
          </button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Notes encryption key">
        <p className="flex items-start gap-2 bg-[var(--accent-amber)]/10 px-4 py-2.5 text-[12px] leading-relaxed text-[var(--accent-amber-text)]">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          Notes are encrypted with this key. Without a backup, they can't be restored on {MACHINE.anotherMachine}.
        </p>
        <SettingsRow {...rowProps("backup.vaultExport")}>
          <button onClick={() => setShowVaultExport(true)} className={BTN_PRIMARY}>
            Back up…
          </button>
        </SettingsRow>
        <SettingsRow {...rowProps("backup.vaultImport")}>
          <button onClick={() => setShowVaultImport(true)} className={BTN_SECONDARY}>
            Restore…
          </button>
        </SettingsRow>
      </SettingsSection>

      <ConfirmDialog
        open={showImportOptions}
        title="Import config"
        body={
          <>
            <p>Your current configuration will be backed up before any changes are applied.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-[var(--text-primary)]">
              <input type="checkbox" checked={importOverwrite} onChange={(e) => setImportOverwrite(e.target.checked)} className="mt-0.5" />
              <span>
                Overwrite existing projects
                <span className="block text-[11px] text-[var(--text-muted)]">When off, projects with the same name are skipped.</span>
              </span>
            </label>
          </>
        }
        confirmLabel="Choose file…"
        onCancel={() => setShowImportOptions(false)}
        onConfirm={() => handleImport(importOverwrite)}
      />

      <ImportReportModal report={importReport} onClose={() => setImportReport(null)} />

      <PassphraseModal
        open={showVaultExport}
        title="Back up your encryption key"
        body={`Choose a password to protect the backup file. You'll need this password later to restore your key on ${MACHINE.anotherMachine} — write it down or save it in a password manager. Anyone who has both the file and this password can read your notes.`}
        submitLabel="Back up"
        confirm
        onCancel={() => setShowVaultExport(false)}
        onSubmit={handleVaultExport}
      />

      <PassphraseModal
        open={showVaultImport}
        title="Restore your encryption key"
        body={`Pick the backup file in the next dialog, then enter the password you chose when you created it. If ${MACHINE.thisMachine} already has a different key stored, remove it${isMac ? " from the Keychain" : ""} first.`}
        submitLabel="Restore"
        onCancel={() => setShowVaultImport(false)}
        onSubmit={handleVaultImport}
      />
    </>
  );
}
