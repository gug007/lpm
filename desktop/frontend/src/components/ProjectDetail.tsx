import { useState, useCallback, useEffect, useRef } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { ActionButton } from "./ActionButton";
import { TerminalView } from "./TerminalView";
import { ConfigEditor } from "./ConfigEditor";
import { RunAction } from "../../wailsjs/go/main/App";
import { getSettings, saveSettings } from "../settings";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";
import { type TerminalThemeName, terminalThemeNames } from "../terminal-themes";
import type { ProjectInfo, ActionInfo } from "../types";
import { iconProps, XIcon } from "./icons";

const EMPTY_SERVICES: { name: string }[] = [];

function ZapIcon() { return <svg {...iconProps}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>; }
function PlayIcon() { return <svg {...iconProps} width={12} height={12} fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>; }
function SpinnerIcon() {
  return (
    <svg {...iconProps} width={12} height={12} strokeWidth={2} className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
function CheckCircleIcon() { return <svg {...iconProps} width={12} height={12} stroke="var(--accent-green)" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>; }
function ErrorCircleIcon() { return <svg {...iconProps} width={12} height={12} stroke="var(--accent-red)" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>; }

function ActionTerminal({ label, onClose }: { label: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState<{ success: boolean; error?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanupOutput = EventsOn("action-output", (data: { line: string }) => {
      setLines((prev) => [...prev, data.line]);
    });
    const cleanupDone = EventsOn("action-done", (data: { success: boolean; error?: string }) => {
      setDone(data);
    });
    return () => {
      if (typeof cleanupOutput === "function") cleanupOutput();
      if (typeof cleanupDone === "function") cleanupDone();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex w-[560px] max-h-[70vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2">
            {!done && <SpinnerIcon />}
            {done?.success && <CheckCircleIcon />}
            {done && !done.success && <ErrorCircleIcon />}
            <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
            {done && (
              <span className={`text-[10px] ${done.success ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                {done.success ? "completed" : "failed"}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          >
            <XIcon />
          </button>
        </div>
        <div className="flex-1 select-text overflow-y-auto bg-[var(--terminal-bg)] px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--terminal-fg)]">
          {lines.length === 0 && !done && (
            <span className="text-[var(--text-muted)]">Running...</span>
          )}
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{line || "\u00A0"}</div>
          ))}
          {done?.error && (
            <div className="mt-2 text-[var(--accent-red)]">{done.error}</div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function ActionsPopover({ actions, projectName, onClose, onError }: {
  actions: ActionInfo[];
  projectName: string;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [runningAction, setRunningAction] = useState<ActionInfo | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionInfo | null>(null);
  const confirmRef = useRef(confirmAction);
  const runningRef = useRef(runningAction);
  confirmRef.current = confirmAction;
  runningRef.current = runningAction;

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (confirmRef.current || runningRef.current) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  const run = (action: ActionInfo) => {
    if (action.confirm) {
      setConfirmAction(action);
      return;
    }
    execute(action);
  };

  const execute = async (action: ActionInfo) => {
    setConfirmAction(null);
    try {
      await RunAction(projectName, action.name);
      setRunningAction(action);
    } catch (err) {
      onError(`${action.label}: ${err}`);
    }
  };

  return (
    <>
      <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
        <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Actions
        </div>
        {actions.map((action) => (
          <button
            key={action.name}
            onClick={() => run(action)}
            disabled={runningAction !== null}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            <span className="flex-1 font-mono truncate">{action.label}</span>
            <PlayIcon />
          </button>
        ))}
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
          <div className="relative w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl">
            <p className="text-sm text-[var(--text-secondary)]">
              Run <span className="font-medium text-[var(--text-primary)]">{confirmAction.label}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => execute(confirmAction)}
                className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] hover:opacity-90"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}

      {runningAction && (
        <ActionTerminal
          label={runningAction.label}
          onClose={() => { setRunningAction(null); onClose(); }}
        />
      )}
    </>
  );
}

interface ProjectDetailProps {
  project: ProjectInfo;
  visible?: boolean;
  onStart: (name: string, profile: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onRefresh: (newName?: string) => void;
  onRemove: (name: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function ProjectDetail({
  project,
  visible = true,
  onStart,
  onStop,
  onRestart,
  onRefresh,
  onRemove,
  onError,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState(
    project.activeProfile || project.profiles?.[0] || ""
  );
  useEffect(() => {
    if (project.activeProfile) setActiveProfile(project.activeProfile);
  }, [project.activeProfile]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const saved = getSettings().terminalTheme;
  const [termTheme, setTermTheme] = useState<TerminalThemeName>(
    saved && terminalThemeNames.includes(saved as TerminalThemeName) ? saved as TerminalThemeName : "default"
  );

  const handleTerminalThemeChange = useCallback((theme: TerminalThemeName) => {
    setTermTheme(theme);
    const s = getSettings();
    saveSettings({ ...s, terminalTheme: theme === "default" ? undefined : theme });
  }, []);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  const hasProfiles = project.profiles && project.profiles.length > 0;
  const hasActions = project.actions && project.actions.length > 0;
  const [detailView, setDetailView] = useState<"terminal" | "config">(() => {
    const saved = getProjectTerminals(project.name).detailView;
    return saved === "config" ? "config" : "terminal";
  });

  const switchDetailView = useCallback((view: "terminal" | "config") => {
    setDetailView(view);
    const state = getProjectTerminals(project.name);
    saveProjectTerminals(project.name, { ...state, detailView: view });
  }, [project.name]);

  return (
    <div className="flex h-full flex-col">
      <div className="wails-drag flex items-center justify-between -mx-3 py-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <div className="flex items-center rounded border border-[var(--border)] p-px" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
            <button
              onClick={() => switchDetailView("terminal")}
              className={`rounded-sm px-2 py-0.5 text-[10px] font-medium transition-colors ${
                detailView === "terminal"
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Terminal
            </button>
            <button
              onClick={() => switchDetailView("config")}
              className={`rounded-sm px-2 py-0.5 text-[10px] font-medium transition-colors ${
                detailView === "config"
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Config
            </button>
          </div>
          {hasProfiles && (
            <div className="flex items-center rounded border border-[var(--border)] p-px" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
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
        <div className="flex items-center gap-2" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
          {hasActions && (
            <div className="relative">
              <button
                onClick={() => setShowActions((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  showActions
                    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <ZapIcon />
                Actions
              </button>
              {showActions && (
                <ActionsPopover
                  actions={project.actions}
                  projectName={project.name}
                  onClose={() => setShowActions(false)}
                  onError={onError}
                />
              )}
            </div>
          )}
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
                onClick={() =>
                  withLoading(async () => {
                    await onStop(project.name);
                    const saved = getProjectTerminals(project.name).terminals;
                    if (!saved || saved.length === 0) {
                      switchDetailView("config");
                    }
                  })
                }
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
                  withLoading(async () => {
                    await onStart(project.name, activeProfile);
                    setDetailView("terminal");
                  })
                }
                disabled={loading}
                variant="primary"
                label="Start"
              />
            </>
          )}
        </div>
      </div>

      {detailView === "terminal" ? (
        <div className="mt-1.5 -mx-6 -mb-6 flex min-h-0 flex-1 flex-col overflow-hidden">
          <TerminalView
            projectName={project.name}
            services={project.running ? project.services : EMPTY_SERVICES}
            terminalTheme={termTheme}
            onTerminalThemeChange={handleTerminalThemeChange}
            visible={visible}
          />
        </div>
      ) : (
        <div className="mt-1.5 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
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
