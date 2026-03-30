import { useState } from "react";
import { CreateProject, BrowseFolder } from "../../wailsjs/go/main/App";

interface AddProjectProps {
  initialFolder: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}

export function AddProject({ initialFolder, onClose, onCreated }: AddProjectProps) {
  const [name, setName] = useState(initialFolder.split("/").pop() || "");
  const [root, setRoot] = useState(initialFolder);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const valid = name.trim() !== "" && root.trim() !== "";

  const handleBrowse = async () => {
    const dir = await BrowseFolder();
    if (dir) {
      setRoot(dir);
      if (!name) {
        const folderName = dir.split("/").pop() || "";
        setName(folderName);
      }
    }
  };

  const handleCreate = async () => {
    if (!valid) return;
    setCreating(true);
    setError(null);
    try {
      await CreateProject(name.trim(), root.trim());
      onCreated(name.trim());
    } catch (err) {
      setError(`${err}`);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && valid && !creating) handleCreate();
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          New project
        </h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              autoFocus
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="~/Projects/my-project"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
              />
              <button
                onClick={handleBrowse}
                className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-[var(--accent-red)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!valid || creating}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-85 disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
