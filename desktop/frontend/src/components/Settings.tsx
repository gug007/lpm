import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "../store/settings";
import { applyTheme, type Theme } from "../theme";
import { useEventListener } from "../hooks/useEventListener";
import {
  MIN_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  useTerminalFontSize,
} from "../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import {
  type TerminalThemeName,
  terminalThemeNames,
  getTerminalThemeColors,
} from "../terminal-themes";
import { ProgressBar } from "./ui/ProgressBar";
import { BrowserOpenURL, EventsOn } from "../../wailsjs/runtime/runtime";
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
  VaultExportKey,
  VaultImportKey,
} from "../../wailsjs/go/main/App";
import type { main } from "../../wailsjs/go/models";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Modal } from "./ui/Modal";
import { TrafficLights } from "./ui/TrafficLights";
import { CheckIcon, PencilIcon, TrashIcon } from "./icons";
import { useAppStore, type SettingsTab } from "../store/app";
import { modalInputDefaults } from "../forms/styles";

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
  const theme = useSettingsStore((s) => s.theme);
  const dblClick = useSettingsStore((s) => s.doubleClickToToggle);
  const soundEnabled = useSettingsStore((s) => s.soundNotifications ?? false);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled ?? false);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice ?? "af_heart");
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed ?? 1.0);
  const openFilesInDefaultApp = useSettingsStore(
    (s) => s.terminalOpenInDefaultApp ?? false,
  );
  const experimentalTTS = useSettingsStore((s) => s.experimentalTTS);
  const updateSettings = useSettingsStore((s) => s.update);

  const setTheme = (next: Theme) => {
    SetDarkMode(applyTheme(next));
    void updateSettings({ theme: next });
  };

  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>("idle");
  const activeTab = useAppStore((s) => s.settingsTab);
  const setActiveTab = useAppStore((s) => s.setSettingsTab);
  const templates = useAppStore((s) => s.templates);
  const selectTemplate = useAppStore((s) => s.selectTemplate);
  const createTemplate = useAppStore((s) => s.createTemplate);
  const removeTemplate = useAppStore((s) => s.removeTemplate);
  const renameTemplate = useAppStore((s) => s.renameTemplate);

  const { fontSize: terminalFontSize, zoomIn: terminalZoomIn, zoomOut: terminalZoomOut } =
    useTerminalFontSize();
  const { theme: terminalTheme, setTheme: setTerminalTheme } = useTerminalTheme();

  useEffect(() => {
    if (!ttsEnabled) return;
    setKokoroStatus("checking");
    CheckKokoroInstalled()
      .then((ok) => setKokoroStatus(ok ? "installed" : "not-installed"))
      .catch(() => setKokoroStatus("not-installed"));
  }, [ttsEnabled]);

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
  const [showVaultExport, setShowVaultExport] = useState(false);
  const [showVaultImport, setShowVaultImport] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importReport, setImportReport] = useState<main.ImportReport | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [creatingTemplateBusy, setCreatingTemplateBusy] = useState(false);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<string | null>(null);

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
      setActiveTab("general");
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

  const navItems: [SettingsTab, string][] = [
    ["general", "General"],
    ["terminal", "Terminal"],
    ...(experimentalTTS ? [["tts", "Text to Speech"] as [SettingsTab, string]] : []),
    ["ai", "AI & Integrations"],
    ["global-config", "Global Config"],
    ["templates", "Templates"],
    ["backup", "Backup & Transfer"],
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
            <>
            <SettingsSection title="General">
              <SettingsRow label="Theme" description="Choose your preferred look">
                <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                  <SegmentButton label="Light" icon={<SunIcon />} active={theme === "light"} onClick={() => setTheme("light")} />
                  <SegmentButton label="Dark" icon={<MoonIcon />} active={theme === "dark"} onClick={() => setTheme("dark")} />
                  <SegmentButton label="System" icon={<MonitorIcon />} active={theme === "system"} onClick={() => setTheme("system")} />
                </div>
              </SettingsRow>
              <SettingsRow label="Double-click to start/stop" description="Double-click a project in sidebar to toggle it">
                <Toggle enabled={dblClick} onChange={(v) => updateSettings({ doubleClickToToggle: v })} />
              </SettingsRow>
              <SettingsRow label="Sound notifications" description="Play sounds when agents finish or need approval">
                <Toggle enabled={soundEnabled} onChange={(v) => updateSettings({ soundNotifications: v })} />
              </SettingsRow>
            </SettingsSection>

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
            </>
          )}

          {activeTab === "terminal" && (
            <SettingsSection title="Terminal">
              <SettingsRow label="Font size" description="Used by the built-in terminal">
                <div className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1">
                  <button
                    onClick={terminalZoomOut}
                    disabled={terminalFontSize <= MIN_TERMINAL_FONT_SIZE}
                    className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                    aria-label="Decrease terminal font size"
                  >
                    −
                  </button>
                  <span className="min-w-[1.5rem] text-center font-mono text-xs tabular-nums text-[var(--text-primary)]">
                    {terminalFontSize}
                  </span>
                  <button
                    onClick={terminalZoomIn}
                    disabled={terminalFontSize >= MAX_TERMINAL_FONT_SIZE}
                    className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                    aria-label="Increase terminal font size"
                  >
                    +
                  </button>
                </div>
              </SettingsRow>
              <div>
                <SettingsRow label="Theme" description="Color scheme for the built-in terminal">
                  <select
                    value={terminalTheme}
                    onChange={(e) => setTerminalTheme(e.target.value as TerminalThemeName)}
                    className={SELECT_CLASS}
                  >
                    {terminalThemeNames.map((name) => (
                      <option key={name} value={name}>
                        {name === "default" ? "Default" : name}
                      </option>
                    ))}
                  </select>
                </SettingsRow>
                <div className="px-4 pb-3">
                  <TerminalThemePreview theme={terminalTheme} fontSize={terminalFontSize} />
                </div>
              </div>
              <SettingsRow
                label="Open files in default app"
                description="Click a file path in the terminal to open it in the OS default app instead of the in-app preview"
              >
                <Toggle
                  enabled={openFilesInDefaultApp}
                  onChange={(v) => updateSettings({ terminalOpenInDefaultApp: v })}
                />
              </SettingsRow>
            </SettingsSection>
          )}

          {activeTab === "tts" && (
            <SettingsSection title="Text to Speech">
              <SettingsRow
                label="Enable"
                description={ttsEnabled ? "Cmd+Shift+R to read selected text" : "Read terminal text aloud using Kokoro"}
              >
                <Toggle enabled={ttsEnabled} onChange={(v) => updateSettings({ ttsEnabled: v })} />
              </SettingsRow>
              {ttsEnabled && (
                <>
                  <SettingsRow label="Voice" description="Kokoro voice">
                    <select value={ttsVoice} onChange={(e) => updateSettings({ ttsVoice: e.target.value })} className={SELECT_CLASS}>
                      <option value="af_heart">af_heart</option>
                      <option value="af_bella">af_bella</option>
                      <option value="af_sarah">af_sarah</option>
                      <option value="am_adam">am_adam</option>
                      <option value="am_michael">am_michael</option>
                    </select>
                  </SettingsRow>
                  <SettingsRow label="Speed" description="Playback speed">
                    <select value={ttsSpeed} onChange={(e) => updateSettings({ ttsSpeed: parseFloat(e.target.value) })} className={SELECT_CLASS}>
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
              <SettingsRow label="VoiceToText" description="Free offline dictation — Claude Code, Codex, Cursor, Slack, or any text field">
                <button onClick={() => BrowserOpenURL("https://voicetotext.cc")} className={BTN_SECONDARY}>Learn more</button>
              </SettingsRow>
            </SettingsSection>
          )}

          {activeTab === "global-config" && (
            <SettingsSection
              title="Global Config"
              description="Actions and terminals defined here are available in every project. Stored in ~/.lpm/global.yml."
            >
              <SettingsRow
                label="Edit global config"
                description="Open the YAML editor."
              >
                <button
                  onClick={() => onNavigate("global-config")}
                  className={BTN_SECONDARY}
                >
                  Edit
                </button>
              </SettingsRow>
            </SettingsSection>
          )}

          {activeTab === "templates" && (
            <SettingsSection
              title="Templates"
              description="Reusable bundles of services, actions, and profiles. Add one to any project to share its setup."
            >
              {templates.length === 0 && !creatingTemplate && (
                <div className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                  No templates yet.
                </div>
              )}
              {templates.map((tmpl) => (
                <TemplateRow
                  key={tmpl.name}
                  name={tmpl.name}
                  onEditConfig={() => selectTemplate(tmpl.name)}
                  onRename={renameTemplate}
                  onDelete={() => setConfirmDeleteTemplate(tmpl.name)}
                />
              ))}
              <div className="flex items-center justify-end px-4 py-2.5">
                <button
                  onClick={() => {
                    setNewTemplateName("");
                    setCreatingTemplate(true);
                  }}
                  className={BTN_SECONDARY}
                >
                  New template
                </button>
              </div>
            </SettingsSection>
          )}

          {activeTab === "backup" && (
            <>
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
            <SettingsSection
              title="Encryption key"
              description="Your notes are locked with a secret key. Back it up to move notes between Macs or recover them later."
            >
              <SettingsRow
                label="Back up your key"
                description="Saves a password-protected file. Keep it somewhere safe."
              >
                <button onClick={() => setShowVaultExport(true)} className={BTN_SECONDARY}>
                  Back up…
                </button>
              </SettingsRow>
              <SettingsRow
                label="Restore your key"
                description="Load a saved key file to unlock notes on this Mac."
              >
                <button onClick={() => setShowVaultImport(true)} className={BTN_SECONDARY}>
                  Restore…
                </button>
              </SettingsRow>
            </SettingsSection>
            </>
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

          <ConfirmDialog
            open={confirmDeleteTemplate !== null}
            title="Delete template"
            variant="destructive"
            confirmLabel="Delete"
            body={
              <>
                Delete{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {confirmDeleteTemplate}
                </span>
                ? Configs that <code>extends</code> this template will fail to load until the reference is removed.
              </>
            }
            onCancel={() => setConfirmDeleteTemplate(null)}
            onConfirm={() => {
              if (confirmDeleteTemplate) removeTemplate(confirmDeleteTemplate);
              setConfirmDeleteTemplate(null);
            }}
          />

          <NewTemplateModal
            open={creatingTemplate}
            value={newTemplateName}
            busy={creatingTemplateBusy}
            onChange={setNewTemplateName}
            onCancel={() => setCreatingTemplate(false)}
            onSubmit={async () => {
              const name = newTemplateName.trim();
              if (!name || creatingTemplateBusy) return;
              setCreatingTemplateBusy(true);
              try {
                await createTemplate(name);
                setCreatingTemplate(false);
              } catch {
                // toast surfaced by store; modal stays open for retry
              } finally {
                setCreatingTemplateBusy(false);
              }
            }}
          />

          <PassphraseModal
            open={showVaultExport}
            title="Back up your encryption key"
            body="Choose a password to protect the backup file. You'll need this password later to restore your key on another Mac — write it down or save it in a password manager. Anyone who has both the file and this password can read your notes."
            submitLabel="Back up"
            confirm
            onCancel={() => setShowVaultExport(false)}
            onSubmit={handleVaultExport}
          />

          <PassphraseModal
            open={showVaultImport}
            title="Restore your encryption key"
            body="Pick the backup file in the next dialog, then enter the password you chose when you created it. If this Mac already has a different key stored, remove it from the Keychain first."
            submitLabel="Restore"
            onCancel={() => setShowVaultImport(false)}
            onSubmit={handleVaultImport}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 space-y-1">
      <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </h2>
      {description && (
        <p className="pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
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
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
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

function TerminalThemePreview({ theme, fontSize }: { theme: TerminalThemeName; fontSize: number }) {
  const colors = getTerminalThemeColors(theme);
  const bg = colors?.bg ?? "var(--terminal-bg)";
  const fg = colors?.fg ?? "var(--terminal-fg)";
  const header = colors?.header ?? "var(--terminal-header)";
  const headerText = colors?.headerText ?? "var(--terminal-header-text)";
  const cursor = colors?.cursor ?? fg;
  const bodyFontSize = Math.min(fontSize, 11);

  return (
    <div
      className="w-full overflow-hidden rounded-md border border-[var(--border)] font-mono shadow-sm"
      style={{ background: bg, color: fg }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5"
        style={{ background: header, color: headerText }}
      >
        <TrafficLights />
        <span className="ml-1 truncate text-[10px] leading-none">terminal</span>
      </div>
      <div className="px-2 py-1.5 leading-tight" style={{ fontSize: `${bodyFontSize}px` }}>
        <div>$ lpm start</div>
        <div style={{ opacity: 0.7 }}>✓ web running on :3000</div>
        <div className="flex items-center">
          <span>$&nbsp;</span>
          <span
            className="demo-cursor inline-block"
            style={{ width: "0.55em", height: "1em", background: cursor }}
          />
        </div>
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

function TemplateRow({
  name,
  onEditConfig,
  onRename,
  onDelete,
}: {
  name: string;
  onEditConfig: () => void;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const dirty = value.trim().length > 0 && value.trim() !== name;

  const startRename = () => {
    setValue(name);
    setRenaming(true);
  };

  const commit = async () => {
    setRenaming(false);
    if (!dirty) return;
    try {
      await onRename(name, value.trim());
    } catch {
      // toast surfaced by store
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      {renaming ? (
        <>
          <input
            autoFocus
            {...modalInputDefaults}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (dirty) commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setRenaming(false);
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-[var(--accent-cyan)] bg-[var(--bg-primary)] px-1 py-0 font-mono text-[12px] text-[var(--text-primary)] outline-none"
          />
          <button
            onClick={commit}
            disabled={!dirty}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-green)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
            title="Save (Esc to cancel)"
          >
            <CheckIcon />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={startRename}
            className="flex-1 truncate text-left font-mono text-[12px] text-[var(--text-primary)] hover:text-[var(--accent-cyan)]"
            title="Rename"
          >
            {name}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onEditConfig}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              title="Edit config"
            >
              <PencilIcon />
            </button>
            <button
              onClick={onDelete}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-red-400"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NewTemplateModal({
  open,
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  value: string;
  busy: boolean;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = value.trim().length > 0 && !busy;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="w-[420px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">New template</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Pick a short, memorable name. You'll use it to add this template to your projects.
      </p>
      <input
        autoFocus
        {...modalInputDefaults}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="e.g. rails"
        className="mt-4 w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--text-primary)]/40"
      />
      <div className="mt-3 text-[11px] text-[var(--text-muted)]">
        After saving, add this snippet to any project's config:
        <pre className="mt-1 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[11px] text-[var(--text-primary)]">
{`extends: [${value.trim() || "your-name"}]`}
        </pre>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
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

function PassphraseModal({
  open,
  title,
  body,
  submitLabel,
  confirm = false,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  body: string;
  submitLabel: string;
  // When true, require a matching confirm input. Used for export flows where
  // a typo locks the user out of their own backup.
  confirm?: boolean;
  onCancel: () => void;
  onSubmit: (passphrase: string) => void;
}) {
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPass("");
      setConfirmPass("");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (pass.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    if (confirm && pass !== confirmPass) {
      setError("Passphrases don't match.");
      return;
    }
    onSubmit(pass);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="w-[420px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{body}</p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--text-secondary)]">Passphrase</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoFocus
            className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--text-primary)]/40"
            placeholder="At least 8 characters"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !confirm) submit();
            }}
          />
        </label>
        {confirm && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--text-secondary)]">Confirm passphrase</span>
            <input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-[var(--text-primary)]/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
        )}
        {error && (
          <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-400">{error}</p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs text-[var(--bg-primary)]"
        >
          {submitLabel}
        </button>
      </div>
    </Modal>
  );
}

