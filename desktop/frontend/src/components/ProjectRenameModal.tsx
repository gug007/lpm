import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./ui/Modal";
import { AlertCircleIcon, ChevronRightIcon, FolderIcon } from "./icons";
import { BrowseFolder } from "../../bridge/commands";
import { modalInputDefaults } from "../forms/styles";

interface ProjectRenameModalProps {
  open: boolean;
  displayName: string;
  currentRoot: string;
  canRenameFolder: boolean;
  folderBusy: boolean;
  onClose: () => void;
  onRenameLabel: (value: string) => void;
  onMoveFolder: (newRoot: string) => Promise<void>;
}

export function ProjectRenameModal({
  open,
  displayName,
  currentRoot,
  canRenameFolder,
  folderBusy,
  onClose,
  onRenameLabel,
  onMoveFolder,
}: ProjectRenameModalProps) {
  const [label, setLabel] = useState(displayName);
  const [expanded, setExpanded] = useState(false);
  const [root, setRoot] = useState(currentRoot);
  const [submitting, setSubmitting] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(displayName);
    setExpanded(false);
    setRoot(currentRoot);
    setSubmitting(false);
    requestAnimationFrame(() => {
      const el = labelRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open, displayName, currentRoot]);

  const labelTrim = label.trim();
  const labelChanged = labelTrim.length > 0 && labelTrim !== displayName.trim();
  const rootTrim = root.trim();
  const looksAbsolute =
    rootTrim.startsWith("/") || rootTrim === "~" || rootTrim.startsWith("~/");
  const folderChanged =
    expanded &&
    canRenameFolder &&
    !folderBusy &&
    looksAbsolute &&
    rootTrim !== currentRoot.trim();
  const canSubmit = !submitting && (labelChanged || folderChanged);

  const browse = async () => {
    const parent = await BrowseFolder();
    if (!parent) return;
    const base = currentRoot.split("/").filter(Boolean).pop() ?? "";
    setRoot(`${parent.replace(/\/+$/, "")}/${base}`);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (folderChanged) {
      setSubmitting(true);
      try {
        await onMoveFolder(rootTrim);
      } catch {
        setSubmitting(false);
        return;
      }
    }
    if (labelChanged) onRenameLabel(labelTrim);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Rename project
        </h3>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          Sets a display label. The folder on disk isn't renamed unless you choose to below.
        </p>
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          {...modalInputDefaults}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2.5 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
        />

        {canRenameFolder && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
            >
              <span
                className={`flex items-center transition-transform [&>svg]:h-3.5 [&>svg]:w-3.5 ${
                  expanded ? "rotate-90" : ""
                }`}
              >
                <ChevronRightIcon />
              </span>
              Rename folder on disk
            </button>

            {expanded &&
              (folderBusy ? (
                <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
                  Stop the project and close its terminals to rename its folder.
                </p>
              ) : (
                <div className="mt-2">
                  <p
                    className="truncate rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] text-[var(--text-muted)]"
                    title={currentRoot}
                  >
                    {currentRoot}
                  </p>
                  <div className="relative mt-2">
                    <input
                      value={root}
                      onChange={(e) => setRoot(e.target.value)}
                      {...modalInputDefaults}
                      placeholder="New folder location"
                      className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2 pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
                    />
                    <button
                      type="button"
                      onClick={browse}
                      title="Choose parent folder"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      <FolderIcon />
                    </button>
                  </div>
                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--accent-red)]/10 px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary)]">
                    <span className="mt-px shrink-0 text-[var(--accent-red)] [&>svg]:h-4 [&>svg]:w-4">
                      <AlertCircleIcon />
                    </span>
                    <span>This moves the actual folder on your computer.</span>
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            {submitting ? "Moving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
