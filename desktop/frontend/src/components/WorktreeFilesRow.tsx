import { FileKey } from "lucide-react";
import { SegmentedControl } from "./ui/SegmentedControl";
import { useWorktreeFiles, type BringMode } from "./useWorktreeFiles";

interface WorktreeFilesRowProps {
  projectName: string;
}

const MODE_OPTIONS = [
  { value: "copy" as const, label: "Copy", tooltip: "Each worktree gets its own copy to change" },
  { value: "link" as const, label: "Link", tooltip: "Each worktree links to the project's file, so an edit reaches all of them" },
];

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

// In the New worktree dialog's Options: the ignored files a fresh checkout
// won't have, ticked to come along into every worktree of this project.
export function WorktreeFilesRow({ projectName }: WorktreeFilesRowProps) {
  const { files, chosen, mode, toggle, setMode } = useWorktreeFiles(projectName);
  if (!files || files.length === 0) return null;
  const any = chosen.size > 0;

  return (
    <div className="flex gap-3 px-4 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          any ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]" : "bg-[var(--bg-active)] text-[var(--text-muted)]"
        }`}
      >
        <FileKey size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--text-primary)]">Bring ignored files</span>
            <span className="block text-[12px] leading-snug text-[var(--text-muted)]">
              Git leaves these out of a worktree. The ones you tick come along, and {projectName}'s worktrees keep
              bringing them.
            </span>
          </span>
          <SegmentedControl<BringMode>
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
            variant="subtle"
            ariaLabel="How worktrees bring the files"
          />
        </div>
        <ul className="mt-2.5 flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.path}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-[12px] transition-colors hover:bg-[var(--bg-hover)]">
                <input
                  type="checkbox"
                  checked={chosen.has(file.path)}
                  onChange={() => toggle(file.path)}
                  className="h-3 w-3 accent-[var(--accent-blue)]"
                />
                <span
                  className={`min-w-0 flex-1 truncate font-mono ${
                    chosen.has(file.path) ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {file.path}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-muted)]">{sizeText(file.size)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
