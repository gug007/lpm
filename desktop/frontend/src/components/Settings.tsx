import { useState, useEffect } from "react";
import { SETTINGS, getSetting, setSetting } from "../settings";

import { getStoredTheme, applyTheme, type Theme } from "../theme";

import { SetDarkMode } from '../../wailsjs/go/main/App';

export function Settings() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const dark = applyTheme(theme);
    localStorage.setItem("lpm-theme", theme);
    SetDarkMode(dark);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const dark = applyTheme("system");
      SetDarkMode(dark);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 space-y-1">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Behavior
        </h2>

        <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
          <SettingsRow
            label="Double-click to start/stop"
            description="Double-click a project in sidebar to toggle it"
          >
            <Toggle
              enabled={getSetting(SETTINGS.DOUBLE_CLICK)}
              onChange={(v) => setSetting(SETTINGS.DOUBLE_CLICK, v)}
            />
          </SettingsRow>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Appearance
        </h2>

        <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
          <SettingsRow
            label="Theme"
            description="Choose your preferred look"
          >
            <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              <ThemeButton
                label="Light"
                icon={<SunIcon />}
                active={theme === "light"}
                onClick={() => setTheme("light")}
              />
              <ThemeButton
                label="Dark"
                icon={<MoonIcon />}
                active={theme === "dark"}
                onClick={() => setTheme("dark")}
              />
              <ThemeButton
                label="System"
                icon={<MonitorIcon />}
                active={theme === "system"}
                onClick={() => setTheme("system")}
              />
            </div>
          </SettingsRow>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          About
        </h2>

        <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
          <SettingsRow label="Version" description="lpm desktop">
            <span className="text-xs text-[var(--text-muted)]">0.1.9</span>
          </SettingsRow>
        </div>
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

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const [on, setOn] = useState(enabled);
  return (
    <button
      onClick={() => {
        setOn(!on);
        onChange(!on);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
