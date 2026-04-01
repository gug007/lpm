import { useState, useCallback, useEffect } from "react";
import { ActionButton } from "./ActionButton";
import { TerminalView } from "./TerminalView";
import { ConfigEditor } from "./ConfigEditor";
import { getSettings, saveSettings } from "../settings";
import { type TerminalThemeName, terminalThemeNames } from "../terminal-themes";
import type { ProjectInfo } from "../types";

interface ProjectDetailProps {
  project: ProjectInfo;
  onStart: (name: string, profile: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onRefresh: (newName?: string) => void;
  onRemove: (name: string) => Promise<void>;
}

export function ProjectDetail({
  project,
  onStart,
  onStop,
  onRestart,
  onRefresh,
  onRemove,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState(
    project.activeProfile || project.profiles?.[0] || ""
  );
  useEffect(() => {
    if (project.activeProfile) setActiveProfile(project.activeProfile);
  }, [project.activeProfile]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const saved = getSettings().terminalThemes?.[project.name];
  const [termTheme, setTermTheme] = useState<TerminalThemeName>(
    saved && terminalThemeNames.includes(saved as TerminalThemeName) ? saved as TerminalThemeName : "default"
  );

  const handleTerminalThemeChange = useCallback((theme: TerminalThemeName) => {
    setTermTheme(theme);
    const s = getSettings();
    const themes = { ...s.terminalThemes };
    if (theme === "default") {
      delete themes[project.name];
    } else {
      themes[project.name] = theme;
    }
    saveSettings({ ...s, terminalThemes: Object.keys(themes).length ? themes : undefined });
  }, [project.name]);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  const hasProfiles = project.profiles && project.profiles.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between -mx-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {hasProfiles && (
            <div className="flex items-center rounded border border-[var(--border)] p-px">
              {project.profiles.map((p) => (
                <button
                  key={p}
                  onClick={() => setActiveProfile(p)}
                  disabled={project.running}
                  className={`rounded-sm px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-default ${
                    activeProfile === p
                      ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:hover:text-[var(--text-muted)]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project.running ? (
            <>
              <ActionButton
                onClick={() =>
                  withLoading(() =>
                    onRestart(project.name, activeProfile)
                  )
                }
                disabled={loading}
                variant="secondary"
                label="Restart"
              />
              <ActionButton
                onClick={() => withLoading(() => onStop(project.name))}
                disabled={loading}
                variant="destructive"
                label="Stop"
              />
            </>
          ) : (
            <>
              <ActionButton
                onClick={() => setConfirmRemove(true)}
                disabled={false}
                variant="secondary"
                label="Remove"
              />
              <ActionButton
                onClick={() =>
                  withLoading(() =>
                    onStart(project.name, activeProfile)
                  )
                }
                disabled={loading}
                variant="primary"
                label="Start"
              />
            </>
          )}
        </div>
      </div>

      {project.running && project.services?.length > 0 ? (
        <div className="mt-3 -mx-2 -mb-3 flex flex-1 flex-col overflow-hidden">
          <TerminalView
            projectName={project.name}
            services={project.services}
            terminalTheme={termTheme}
            onTerminalThemeChange={handleTerminalThemeChange}
          />
        </div>
      ) : (
        <div className="mt-3 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <ConfigEditor
            projectName={project.name}
            onSaved={onRefresh}
          />
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmRemove(false)}
          />
          <div className="relative w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Remove project
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Are you sure you want to remove{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {project.name}
              </span>
              ? This will delete the config file and stop any running session.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onRemove(project.name);
                  setConfirmRemove(false);
                }}
                disabled={loading}
                className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-85 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
