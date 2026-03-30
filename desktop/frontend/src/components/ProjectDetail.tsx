import { useState } from "react";
import { StatusDot } from "./StatusDot";
import { ServiceList } from "./ServiceList";
import type { ProjectInfo } from "../types";

interface ProjectDetailProps {
  project: ProjectInfo;
  onStart: (name: string, profile: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
  onEdit: (name: string) => void;
}

export function ProjectDetail({
  project,
  onStart,
  onStop,
  onRestart,
  onEdit,
}: ProjectDetailProps) {
  const [loading, setLoading] = useState(false);
  const [activeProfile, setActiveProfile] = useState("");

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {project.running && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <StatusDot running={true} />
              Running
            </p>
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
        </div>
      </div>

      {project.profiles && project.profiles.length > 0 && (
        <div className="mt-5 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Profile</span>
          <div className="flex gap-1">
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
        </div>
      )}

      <div className="mt-5">
        <ServiceList services={project.services || []} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[11px] text-[var(--text-muted)]">{project.root}</p>
        <button
          onClick={() => onEdit(project.name)}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          Edit config
        </button>
      </div>
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
