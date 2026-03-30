import { useState } from "react";
import { StatusDot } from "./StatusDot";
import { ServiceList } from "./ServiceList";
import type { ProjectInfo } from "../types";

interface ProjectDetailProps {
  project: ProjectInfo;
  onStart: (name: string, profile: string) => Promise<void>;
  onStop: (name: string) => Promise<void>;
  onRestart: (name: string, profile: string) => Promise<void>;
}

export function ProjectDetail({
  project,
  onStart,
  onStop,
  onRestart,
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
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusDot running={project.running} />
            <span className="text-sm text-[var(--text-secondary)]">
              {project.running ? "Running" : "Stopped"}
              {" \u00b7 "}
              {project.services?.length || 0} service
              {(project.services?.length || 0) !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
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
              onClick={() => withLoading(() => onRestart(project.name, activeProfile))}
              disabled={loading}
              variant="secondary"
              icon="↻"
              label="Restart"
            />
          </>
        ) : (
          <ActionButton
            onClick={() => withLoading(() => onStart(project.name, activeProfile))}
            disabled={loading}
            variant="primary"
            icon="▶"
            label="Start"
          />
        )}
      </div>

      {project.profiles && project.profiles.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Profile
          </h3>
          <div className="flex flex-wrap gap-2">
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

      <div className="mt-6">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Services
        </h3>
        <ServiceList services={project.services || []} />
      </div>

      <div className="mt-8 space-y-1 text-xs text-[var(--text-muted)]">
        <p>Root: {project.root}</p>
        <p>Config: ~/.lpm/projects/{project.name}.yml</p>
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
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${actionStyles[variant]}`}
    >
      <span className="text-xs">{icon}</span>
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
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--accent-cyan)] text-gray-900"
          : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      {name}
    </button>
  );
}
