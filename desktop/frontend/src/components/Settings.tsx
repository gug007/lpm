import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getSettings, saveSettings } from "../settings";
import { applyTheme, type Theme } from "../theme";
import { useEventListener } from "../hooks/useEventListener";
import { ProgressBar } from "./ui/ProgressBar";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import {
  SetDarkMode,
  GetVersion,
  CheckForUpdate,
  InstallUpdate,
  CheckClaudeHooks,
  ResetClaudeHooks,
  ExportConfig,
  ImportConfig,
  CheckKokoroInstalled,
  InstallKokoro,
  UninstallKokoro,
} from "../../wailsjs/go/main/App";
import type { main } from "../../wailsjs/go/models";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Modal } from "./ui/Modal";

const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

type HooksStatus = "idle" | "checking" | "installed" | "missing" | "no-settings";
type UpdateStatus = "idle" | "checking" | "available" | "up-to-date" | "installing" | "error";

const HOOKS_DESCRIPTION: Record<HooksStatus, string> = {
  idle: "Display Claude Code running progress in sidebar",
  checking: "Checking...",
  installed: "Hooks installed correctly",
  missing: "Hooks not configured",
  "no-settings": "Claude Code settings not found",
};

const BTN_SECONDARY =
  "rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50";

const SELECT_CLASS =
  "rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)]";

import type { View } from "../store/app";

interface SettingsProps {
  onNavigate: (view: View) => void;
  pendingUpdateCheck?: boolean;
  onConsumedUpdateCheck?: () => void;
}

function getUpdateDescription(
  status: UpdateStatus,
  latestVersion: string,
  error: string,
): string {
  switch (status) {
    case "checking":
      return "Checking...";
    case "installing":
      return "Downloading and installing...";
    case "available":
      return `v${latestVersion} available`;
    case "up-to-date":
      return "You're up to date";
    case "error":
      return error || "Failed to check";
    default:
      return "Check for new versions";
  }
}

export function Settings({
  onNavigate,
  pendingUpdateCheck = false,
  onConsumedUpdateCheck,
}: SettingsProps) {
  const settings = getSettings();

  // General
  const [theme, setTheme] = useState<Theme>(settings.theme);
  const [dblClick, setDblClick] = useState(settings.doubleClickToToggle);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundNotifications ?? false);
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled ?? false);
  const [ttsVoice, setTtsVoice] = useState(settings.ttsVoice ?? "af_heart");
  const [ttsSpeed, setTtsSpeed] = useState(settings.ttsSpeed ?? 1.0);
  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>("idle");
  type SettingsTab = "general" | "ai" | "backup" | "about";
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (!ttsEnabled) return;
    setKokoroStatus("checking");
    CheckKokoroInstalled()
      .then((ok) => setKokoroStatus(ok ? "installed" : "not-installed"))
      .catch(() => setKokoroStatus("not-installed"));
  }, [ttsEnabled]);

  // About & Updates
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [hooksStatus, setHooksStatus] = useState<HooksStatus>("idle");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resettingHooks, setResettingHooks] = useState(false);
  const [installProgress, setInstallProgress] = useState(-1);
  const [installPhase, setInstallPhase] = useState<"downloading" | "installing">("downloading");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importReport, setImportReport] = useState<main.ImportReport | null>(null);

  useEffect(() => {
    if (showImportOptions) setImportOverwrite(false);
  }, [showImportOptions]);

  useEffect(() => {
    GetVersion().then(setVersion);
  }, []);

  useEffect(() => EventsOn("update-progress", (pct: number) => setInstallProgress(pct)), []);
  useEffect(() => EventsOn("update-status", (status: string) => {
    if (status === "downloading") setInstallPhase("downloading");
    else if (status === "installing") setInstallPhase("installing");
  }), []);

  useEffect(() => {
    const dark = applyTheme(theme);
    saveSettings({ theme });
    SetDarkMode(dark);
  }, [theme]);

  useEventListener(
    "change",
    () => {
      const dark = applyTheme("system");
      SetDarkMode(dark);
    },
    darkModeQuery,
    theme === "system",
  );

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateError("");
    try {
      const info = await CheckForUpdate();
      setUpdateStatus(info.updateAvail ? "available" : "up-to-date");
      if (info.updateAvail) setLatestVersion(info.latestVersion);
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
    }
  };

  useEffect(() => {
    if (pendingUpdateCheck) {
      setActiveTab("about");
      handleCheckUpdate();
      onConsumedUpdateCheck?.();
    }
  }, [pendingUpdateCheck]);

  const handleInstallUpdate = async () => {
    setUpdateStatus("installing");
    setInstallProgress(-1);
    setInstallPhase("downloading");
    try {
      await InstallUpdate();
    } catch (err) {
      setUpdateStatus("error");
      setUpdateError(String(err));
    }
  };

  const handleCheckHooks = async () => {
    setHooksStatus("checking");
    try {
      const status = await CheckClaudeHooks();
      if (!status.settingsExists) {
        setHooksStatus("no-settings");
      } else if (status.hooksInstalled) {
        setHooksStatus("installed");
      } else {
        setHooksStatus("missing");
        setShowResetDialog(true);
      }
    } catch {
      setHooksStatus("idle");
    }
  };

  const handleResetHooks = async () => {
    setResettingHooks(true);
    try {
      await ResetClaudeHooks();
      setHooksStatus("installed");
      setShowResetDialog(false);
      toast.success("Claude Code hooks reinstalled");
    } catch (err) {
      toast.error(`Failed to reset hooks: ${err}`);
    } finally {
      setResettingHooks(false);
    }
  };

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

  const navItems: [SettingsTab, string][] = [
    ["general", "General"],
    ["ai", "AI & Integrations"],
    ["backup", "Backup & Transfer"],
    ["about", "About"],
  ];

  return (
    <div className="-mx-6 flex flex-1 overflow-hidden">
      {updateStatus === "installing" && <InstallingOverlay phase={installPhase} progress={installProgress} />}

      <nav className="flex w-42 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] px-3 pt-6">
        <h1 className="mb-4 px-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Settings</h1>
        {navItems.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              activeTab === key
                ? "bg-[var(--bg-active)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-6 pt-6 pb-6">
          {activeTab === "general" && (
            <SettingsSection title="General">
              <SettingsRow label="Theme" description="Choose your preferred look">
                <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                  <SegmentButton label="Light" icon={<SunIcon />} active={theme === "light"} onClick={() => setTheme("light")} />
                  <SegmentButton label="Dark" icon={<MoonIcon />} active={theme === "dark"} onClick={() => setTheme("dark")} />
                  <SegmentButton label="System" icon={<MonitorIcon />} active={theme === "system"} onClick={() => setTheme("system")} />
                </div>
              </SettingsRow>
              <SettingsRow label="Double-click to start/stop" description="Double-click a project in sidebar to toggle it">
                <Toggle enabled={dblClick} onChange={(v) => { setDblClick(v); saveSettings({ doubleClickToToggle: v }); }} />
              </SettingsRow>
              <SettingsRow label="Sound notifications" description="Play sounds when agents finish or need approval">
                <Toggle enabled={soundEnabled} onChange={(v) => { setSoundEnabled(v); saveSettings({ soundNotifications: v }); }} />
              </SettingsRow>
              <SettingsRow
                label="Text to speech"
                description={ttsEnabled ? "Cmd+Shift+R to read selected text" : "Read terminal text aloud using Kokoro"}
              >
                <Toggle enabled={ttsEnabled} onChange={(v) => { setTtsEnabled(v); saveSettings({ ttsEnabled: v }); }} />
              </SettingsRow>
              {ttsEnabled && (
                <>
                  <SettingsRow label="Voice" description="Kokoro voice">
                    <select value={ttsVoice} onChange={(e) => { setTtsVoice(e.target.value); saveSettings({ ttsVoice: e.target.value }); }} className={SELECT_CLASS}>
                      <option value="af_heart">af_heart</option>
                      <option value="af_bella">af_bella</option>
                      <option value="af_sarah">af_sarah</option>
                      <option value="am_adam">am_adam</option>
                      <option value="am_michael">am_michael</option>
                    </select>
                  </SettingsRow>
                  <SettingsRow label="Speed" description="Playback speed">
                    <select value={ttsSpeed} onChange={(e) => { const v = parseFloat(e.target.value); setTtsSpeed(v); saveSettings({ ttsSpeed: v }); }} className={SELECT_CLASS}>
                      <option value={0.5}>0.5x</option>
                      <option value={0.75}>0.75x</option>
                      <option value={1.0}>1.0x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2.0}>2.0x</option>
                    </select>
                  </SettingsRow>
                  <KokoroEngineRow status={kokoroStatus} onStatusChange={setKokoroStatus} />
                </>
              )}
            </SettingsSection>
          )}

          {activeTab === "ai" && (
            <SettingsSection title="AI & Integrations">
              <SettingsRow label="Claude Code Hooks" description={HOOKS_DESCRIPTION[hooksStatus]}>
                <button onClick={handleCheckHooks} disabled={hooksStatus === "checking"} className={BTN_SECONDARY}>
                  {hooksStatus === "checking" ? <RefreshIcon spinning /> : "Check"}
                </button>
              </SettingsRow>
              <SettingsRow label="Commit Instructions" description="Custom instructions for AI commit messages">
                <button onClick={() => onNavigate("commit-instructions")} className={BTN_SECONDARY}>Edit</button>
              </SettingsRow>
              <SettingsRow label="PR Instructions" description="Custom instructions for AI-generated PR titles and descriptions">
                <button onClick={() => onNavigate("pr-instructions")} className={BTN_SECONDARY}>Edit</button>
              </SettingsRow>
              <SettingsRow label="Branch Name Instructions" description="Custom instructions for AI-generated branch names">
                <button onClick={() => onNavigate("branch-instructions")} className={BTN_SECONDARY}>Edit</button>
              </SettingsRow>
              <SettingsRow label="Global Config" description="Shared actions and terminals across all projects">
                <button onClick={() => onNavigate("global-config")} className={BTN_SECONDARY}>Edit</button>
              </SettingsRow>
            </SettingsSection>
          )}

          {activeTab === "backup" && (
            <SettingsSection title="Backup & Transfer">
              <SettingsRow label="Export config" description="Save a portable archive of your projects and settings">
                <button onClick={handleExport} disabled={exporting} className={BTN_SECONDARY}>
                  {exporting ? <RefreshIcon spinning /> : "Export…"}
                </button>
              </SettingsRow>
              <SettingsRow label="Import config" description="Restore from an archive (current config backed up first)">
                <button onClick={() => setShowImportOptions(true)} disabled={importing} className={BTN_SECONDARY}>
                  {importing ? <RefreshIcon spinning /> : "Import…"}
                </button>
              </SettingsRow>
            </SettingsSection>
          )}

          {activeTab === "about" && (
            <SettingsSection title="About">
              <SettingsRow label="Version" description="lpm desktop">
                <span className="text-xs text-[var(--text-muted)]">{version || "..."}</span>
              </SettingsRow>
              <SettingsRow label="Updates" description={getUpdateDescription(updateStatus, latestVersion, updateError)}>
                {updateStatus === "available" ? (
                  <button onClick={handleInstallUpdate} className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
                    Update
                  </button>
                ) : (
                  <button onClick={handleCheckUpdate} disabled={updateStatus === "checking" || updateStatus === "installing"} className={BTN_SECONDARY}>
                    {updateStatus === "checking" || updateStatus === "installing" ? <RefreshIcon spinning /> : "Check"}
                  </button>
                )}
              </SettingsRow>
            </SettingsSection>
          )}

          <ConfirmDialog
            open={showResetDialog}
            title="Reset Claude Code Hooks"
            body="Claude Code hooks are not configured correctly. Would you like to reinstall them?"
            confirmLabel="Reset"
            disabled={resettingHooks}
            onCancel={() => setShowResetDialog(false)}
            onConfirm={handleResetHooks}
          />

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
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 space-y-1">
      <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h2>
      <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="shrink-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SegmentButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function RefreshIcon({ spinning, size = 12 }: { spinning?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function InstallingOverlay({ phase, progress }: { phase: "downloading" | "installing"; progress: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-6 py-5 shadow-lg">
        <RefreshIcon spinning size={24} />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {phase === "downloading" ? "Downloading update..." : "Installing update..."}
        </p>
        {phase === "downloading" && progress >= 0 ? (
          <ProgressBar value={progress} />
        ) : (
          <p className="text-xs text-[var(--text-muted)]">The app will restart when finished</p>
        )}
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

type KokoroStatus = "idle" | "checking" | "installed" | "not-installed" | "installing" | "uninstalling";

const KOKORO_DESCRIPTION: Record<KokoroStatus, string> = {
  idle: "Kokoro TTS engine",
  checking: "Checking...",
  installed: "Installed",
  "not-installed": "Not installed",
  installing: "Installing...",
  uninstalling: "Uninstalling...",
};

function KokoroEngineRow({ status, onStatusChange }: { status: KokoroStatus; onStatusChange: (s: KokoroStatus) => void }) {
  const handleInstall = async () => {
    onStatusChange("installing");
    try {
      await InstallKokoro();
      onStatusChange("installed");
      toast.success("Kokoro installed");
    } catch (err) {
      toast.error(`Install failed: ${err}`);
      onStatusChange("not-installed");
    }
  };

  const handleUninstall = async () => {
    onStatusChange("uninstalling");
    try {
      await UninstallKokoro();
      onStatusChange("not-installed");
      toast.success("Kokoro uninstalled");
    } catch (err) {
      toast.error(`Uninstall failed: ${err}`);
      onStatusChange("installed");
    }
  };

  return (
    <SettingsRow label="Kokoro Engine" description={KOKORO_DESCRIPTION[status]}>
      {status === "installed" ? (
        <button onClick={handleUninstall} className={BTN_SECONDARY}>Uninstall</button>
      ) : status === "not-installed" ? (
        <button onClick={handleInstall} className={BTN_SECONDARY}>Install</button>
      ) : (
        <RefreshIcon spinning />
      )}
    </SettingsRow>
  );
}

function ImportReportModal({
  report,
  onClose,
}: {
  report: main.ImportReport | null;
  onClose: () => void;
}) {
  if (!report) return null;

  const { imported, skipped, missingRoots, missingTools } = report;
  const nothingHappened = imported.length === 0 && skipped.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[30rem] max-h-[80vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">Import complete</h3>

      {nothingHappened && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          The archive was read, but no projects were imported.
        </p>
      )}

      {imported.length > 0 && (
        <ReportSection title={`Imported (${imported.length})`} tone="good">
          <ReportList items={imported} />
        </ReportSection>
      )}

      {skipped.length > 0 && (
        <ReportSection
          title={`Skipped (${skipped.length})`}
          tone="warn"
          note="Already existed locally. Re-run with overwrite to replace them."
        >
          <ReportList items={skipped} />
        </ReportSection>
      )}

      {missingRoots.length > 0 && (
        <ReportSection
          title={`Missing project folders (${missingRoots.length})`}
          tone="warn"
          note="These projects reference folders that don't exist on this Mac. Clone or create them, then reopen the project."
        >
          <ul className="flex flex-col gap-1 text-xs font-mono">
            {missingRoots.map((mr) => (
              <li key={mr.project} className="rounded bg-[var(--bg-active)] px-2 py-0.5">
                <span className="text-[var(--text-primary)]">{mr.project}</span>
                <span className="text-[var(--text-muted)]"> → {mr.root}</span>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      {missingTools.length > 0 && (
        <ReportSection
          title={`Missing tools (${missingTools.length})`}
          tone="warn"
          note="Referenced by project commands but not found in PATH. Install them to run the affected services/actions."
        >
          <ReportList items={missingTools} mono />
        </ReportSection>
      )}

      {report.backupPath && (
        <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-active)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Previous config backed up to
          <div className="mt-0.5 break-all font-mono text-[var(--text-secondary)]">
            {report.backupPath}
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

function ReportSection({
  title,
  tone,
  note,
  children,
}: {
  title: string;
  tone: "good" | "warn";
  note?: string;
  children: React.ReactNode;
}) {
  const color = tone === "good" ? "text-[var(--accent-green)]" : "text-amber-500";
  return (
    <div className="mt-4">
      <div className={`text-xs font-medium uppercase tracking-wider ${color}`}>{title}</div>
      {note && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ReportList({ items, mono }: { items: string[]; mono?: boolean }) {
  return (
    <ul className={`flex flex-wrap gap-1 text-xs ${mono ? "font-mono" : ""}`}>
      {items.map((item) => (
        <li
          key={item}
          className="rounded bg-[var(--bg-active)] px-2 py-0.5 text-[var(--text-secondary)]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
