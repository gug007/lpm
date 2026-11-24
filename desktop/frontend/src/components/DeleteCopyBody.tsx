import { unsavedWorkLines, worktreeBranch } from "../unsavedWork";
import { useUnsavedWork } from "../hooks/useUnsavedWork";
import type { ProjectInfo } from "../types";

interface DeleteCopyBodyProps {
  project: ProjectInfo;
  label: string;
}

// The confirm text for deleting a duplicate or worktree, warning about work
// that lives only in that copy.
export function DeleteCopyBody({ project, label }: DeleteCopyBodyProps) {
  const work = useUnsavedWork(project.root);
  const lines = work === undefined ? null : work ? unsavedWorkLines(work) : [];

  const name = <span className="font-medium text-[var(--text-primary)]">{label}</span>;
  return (
    <>
      {project.worktree ? (
        <>
          Delete {name}? Its worktree folder, everything inside it, and its branch{" "}
          <span className="font-mono text-[12px] text-[var(--text-primary)]">
            {worktreeBranch(project)}
          </span>{" "}
          are permanently deleted. This can't be undone.
        </>
      ) : (
        <>
          Delete {name}? Its folder and everything inside is permanently deleted from disk.
          This can't be undone.
        </>
      )}
      {lines === null ? (
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">Checking for unsaved work…</p>
      ) : (
        lines.length > 0 && (
          <div className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--bg-primary))] px-3 py-2 text-[12px] leading-snug text-[var(--accent-red-text)]">
            <p className="font-medium">Work that exists only here:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )
      )}
    </>
  );
}
