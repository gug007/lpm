import { useState, useEffect } from "react";
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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="mt-8 rounded-lg border border-[var(--border)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Theme
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Use light, dark, or match your system
            </p>
          </div>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            <ThemeButton
              label="Light"
              icon="☀"
              active={theme === "light"}
              onClick={() => setTheme("light")}
            />
            <ThemeButton
              label="Dark"
              icon="☾"
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
            />
            <ThemeButton
              label="System"
              icon="🖥"
              active={theme === "system"}
              onClick={() => setTheme("system")}
            />
          </div>
        </div>
      </div>
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
  icon: string;
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
      <span>{icon}</span>
      {label}
    </button>
  );
}
