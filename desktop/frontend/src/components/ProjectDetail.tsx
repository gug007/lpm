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

      <div className="mt-6 flex gap-3">
        {project.running ? (
          <>
            <button
              onClick={() => withLoading(() => onStop(project.name))}
              disabled={loading}
              className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Stop
            </button>
            <button
              onClick={() =>
                withLoading(() =>
                  onRestart(project.name, activeProfile)
                )
              }
              disabled={loading}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              Restart
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              withLoading(() => onStart(project.name, activeProfile))
            }
            disabled={loading}
            className="rounded-lg bg-[var(--accent-green)] px-4 py-2 text-sm font-medium text-gray-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Start
          </button>
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
