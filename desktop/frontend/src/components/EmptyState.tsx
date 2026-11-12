import { useFirstRunFolderDrop } from "../hooks/useFirstRunFolderDrop";
import { useAppStore } from "../store/app";
import { CloudBranchIcon, FolderIcon } from "./icons";
import { LaptopIcon } from "./connections/LaptopIcon";

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          Select a project
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Choose a project from the sidebar
        </p>
      </div>
    </div>
  );
}

const WAY_IN =
  "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm transition-all active:opacity-75";

export function EmptyStateNoProjects() {
  const pick = useAppStore((s) => s.pickAddProjectKind);
  const connectComputer = useAppStore((s) => s.connectComputer);
  const addProject = useAppStore((s) => s.addProject);
  const dragging = useFirstRunFolderDrop();
  return (
    <div className="relative flex h-full items-center justify-center px-6">
      {dragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-3 z-10 flex items-end justify-center rounded-2xl border-2 border-dashed border-[var(--accent-cyan)] bg-[color-mix(in_srgb,var(--accent-cyan)_6%,transparent)] pb-8"
        >
          <span className="rounded-full bg-[var(--accent-cyan)] px-3 py-1 text-[12px] font-medium text-[var(--bg-primary)] shadow-sm">
            Drop to add it as a project
          </span>
        </div>
      )}
      <div className="flex max-w-xl flex-col items-center text-center">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="13" cy="13" r="5" fill="var(--accent-green)" />
            <circle cx="24" cy="16" r="4.5" fill="var(--text-primary)" opacity="0.85" />
            <circle cx="15" cy="24" r="4.5" fill="var(--text-primary)" opacity="0.55" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Start a project in lpm
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
          Run, stop, and switch between your local dev projects — all from one place.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => void pick("local")}
            className={`${WAY_IN} bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85`}
          >
            <FolderIcon size={15} />
            Open a folder…
          </button>
          <button
            onClick={() => void pick("clone")}
            className={`${WAY_IN} border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
          >
            <CloudBranchIcon size={15} />
            Clone a repository…
          </button>
          <button
            onClick={connectComputer}
            className={`${WAY_IN} border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}
          >
            <LaptopIcon size={15} />
            Connect a computer…
          </button>
        </div>
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">or drop a project folder anywhere in this window</p>
        <button
          onClick={addProject}
          className="mt-4 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Servers and other ways to add a project
        </button>
      </div>
    </div>
  );
}
