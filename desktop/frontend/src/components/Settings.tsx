import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getSettings, saveSettings } from "../settings";
import { applyTheme, type Theme } from "../theme";
import { useEventListener } from "../hooks/useEventListener";
import {
  SetDarkMode,
  GetVersion,
  CheckForUpdate,
  InstallUpdate,
  CheckClaudeHooks,
  ResetClaudeHooks,
} from "../../wailsjs/go/main/App";
import { ConfirmDialog } from "./ui/ConfirmDialog";

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

interface SettingsProps {
  onEditGlobalConfig: () => void;
  onEditCommitInstructions: () => void;
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
  onEditGlobalConfig,
  onEditCommitInstructions,
  pendingUpdateCheck = false,
  onConsumedUpdateCheck,
}: SettingsProps) {
  const settings = getSettings();
  const [theme, setTheme] = useState<Theme>(settings.theme);
  const [dblClick, setDblClick] = useState(settings.doubleClickToToggle);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundNotifications ?? false);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [hooksStatus, setHooksStatus] = useState<HooksStatus>("idle");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resettingHooks, setResettingHooks] = useState(false);

  useEffect(() => {
    GetVersion().then(setVersion);
  }, []);

  useEffect(() => {
    const dark = applyTheme(theme);
    saveSettings({ ...getSettings(), theme });
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
      handleCheckUpdate();
      onConsumedUpdateCheck?.();
    }
  }, [pendingUpdateCheck]);

  const handleInstallUpdate = async () => {
    setUpdateStatus("installing");
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

  return (
    <div className="-mx-6 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-lg px-6 pt-6 pb-6">
        {updateStatus === "installing" && <InstallingOverlay />}
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

        <SettingsSection title="Behavior">
          <SettingsRow
            label="Double-click to start/stop"
            description="Double-click a project in sidebar to toggle it"
          >
            <Toggle
              enabled={dblClick}
              onChange={(v) => {
                setDblClick(v);
                saveSettings({ ...getSettings(), doubleClickToToggle: v });
              }}
            />
          </SettingsRow>
          <SettingsRow
            label="Sound notifications"
            description="Play sounds when agents finish or need approval"
          >
            <Toggle
              enabled={soundEnabled}
              onChange={(v) => {
                setSoundEnabled(v);
                saveSettings({ ...getSettings(), soundNotifications: v });
              }}
            />
          </SettingsRow>
          <SettingsRow
            label="Claude Code Hooks"
            description={HOOKS_DESCRIPTION[hooksStatus]}
          >
            <button
              onClick={handleCheckHooks}
              disabled={hooksStatus === "checking"}
              className={BTN_SECONDARY}
            >
              {hooksStatus === "checking" ? <RefreshIcon spinning /> : "Check"}
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" description="Choose your preferred look">
            <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              <ThemeButton label="Light" icon={<SunIcon />} active={theme === "light"} onClick={() => setTheme("light")} />
              <ThemeButton label="Dark" icon={<MoonIcon />} active={theme === "dark"} onClick={() => setTheme("dark")} />
              <ThemeButton label="System" icon={<MonitorIcon />} active={theme === "system"} onClick={() => setTheme("system")} />
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="AI">
          <SettingsRow
            label="Commit Instructions"
            description="Custom instructions for AI commit messages"
          >
            <button onClick={onEditCommitInstructions} className={BTN_SECONDARY}>
              Edit
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Global Config">
          <SettingsRow
            label="Actions & Terminals"
            description="Shared across all projects"
          >
            <button onClick={onEditGlobalConfig} className={BTN_SECONDARY}>
              Edit
            </button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow label="Version" description="lpm desktop">
            <span className="text-xs text-[var(--text-muted)]">{version || "..."}</span>
          </SettingsRow>
          <SettingsRow
            label="Updates"
            description={getUpdateDescription(updateStatus, latestVersion, updateError)}
          >
            {updateStatus === "available" ? (
              <button
                onClick={handleInstallUpdate}
                className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Update
              </button>
            ) : (
              <button
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking" || updateStatus === "installing"}
                className={BTN_SECONDARY}
              >
                {updateStatus === "checking" || updateStatus === "installing" ? (
                  <RefreshIcon spinning />
                ) : (
                  "Check"
                )}
              </button>
            )}
          </SettingsRow>
        </SettingsSection>

        <ConfirmDialog
          open={showResetDialog}
          title="Reset Claude Code Hooks"
          body="Claude Code hooks are not configured correctly. Would you like to reinstall them?"
          confirmLabel="Reset"
          disabled={resettingHooks}
          onCancel={() => setShowResetDialog(false)}
          onConfirm={handleResetHooks}
        />
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

function ThemeButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
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

function InstallingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-6 py-5 shadow-lg">
        <RefreshIcon spinning size={24} />
        <p className="text-sm font-medium text-[var(--text-primary)]">Installing update...</p>
        <p className="text-xs text-[var(--text-muted)]">The app will restart when finished</p>
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
