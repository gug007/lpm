import { useState } from "react";
import { StatusDot } from "./StatusDot";
import { TerminalView } from "./TerminalView";
import { ConfigEditor } from "./ConfigEditor";
import type { ProjectInfo } from "../types";

interface ProjectDetailProps {
  project: ProjectInfo;
  onStart: (name: string, profile: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onRefresh: () => void;
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
  const [activeProfile, setActiveProfile] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between -mx-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {project.running && <StatusDot running={true} />}
          {project.profiles && project.profiles.length > 0 && (
            <div className="flex items-center gap-1">
              <ProfileTag
                name="all"
                active={activeProfile === ""}
                onClick={() => setActiveProfile("")}
              />
              {project.profiles.map((p) => (
                <ProfileTag
                  key={p}
                  name={p}
                  active={activeProfile === p}
                  onClick={() => setActiveProfile(p)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {project.running ? (
            <>
              <ActionButton
                onClick={() => withLoading(() => onStop(project.name))}
                disabled={loading}
                variant="destructive"
                icon="■"
                label="Stop"
              />
              <ActionButton
                onClick={() =>
                  withLoading(() =>
                    onRestart(project.name, activeProfile)
                  )
                }
                disabled={loading}
                variant="secondary"
                icon="↻"
                label="Restart"
              />
            </>
          ) : (
            <ActionButton
              onClick={() =>
                withLoading(() =>
                  onStart(project.name, activeProfile)
                )
              }
              disabled={loading}
              variant="primary"
              icon="▶"
              label="Start"
            />
          )}
          {!project.running && (
            <ActionButton
              onClick={() => setConfirmRemove(true)}
              disabled={false}
              variant="secondary"
              icon="🗑"
              label=""
            />
          )}
        </div>
      </div>

      {project.running && project.services?.length > 0 ? (
        <div className="mt-3 -mx-6 -mb-6 flex flex-1 flex-col overflow-hidden">
          <TerminalView
            projectName={project.name}
            services={project.services}
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onRemove(project.name);
                  setConfirmRemove(false);
                }}
                disabled={loading}
                className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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

const actionStyles = {
  primary:
    "bg-[var(--accent-green)]/10 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20 border-[var(--accent-green)]/20",
  destructive:
    "bg-[var(--accent-red)]/10 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/20 border-[var(--accent-red)]/20",
  secondary:
    "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border)]",
} as const;

function ActionButton({
  onClick,
  disabled,
  variant,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: keyof typeof actionStyles;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${actionStyles[variant]}`}
    >
      <span className="text-[10px]">{icon}</span>
      {label}
    </button>
  );
}

function ProfileTag({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
          : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {name}
    </button>
  );
}
