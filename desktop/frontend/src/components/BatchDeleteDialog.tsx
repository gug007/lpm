import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { RemovalCopyRow } from "./RemovalCopyRow";
import { projectDisplayName } from "./ProjectNameDisplay";
import { middleTruncate } from "../middleTruncate";
import { stripMarker } from "../peer/markers";
import {
  partitionRemoval,
  removalConfirmPhrase,
  removalSummary,
  removalTitle,
} from "../removalGroups";
import type { ProjectInfo } from "../types";

interface BatchDeleteDialogProps {
  open: boolean;
  // The whole removal set, copies of a removed original included.
  projects: ProjectInfo[];
  projectByName: Map<string, ProjectInfo>;
  // Every project here is a copy whose pull request has merged.
  merged?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const GROUP_HEADER = "px-3 py-1.5 text-[11px] font-medium";
const GROUP_LIST = "max-h-36 overflow-y-auto pb-1";

export function BatchDeleteDialog({
  open,
  projects,
  projectByName,
  merged = false,
  onCancel,
  onConfirm,
}: BatchDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [open]);

  const groups = partitionRemoval(projects);
  const total = projects.length;
  const phrase = removalConfirmPhrase(total);
  const canConfirm = total > 0 && typed.trim() === phrase;
  const label = (p: ProjectInfo) => projectDisplayName(p, projectByName.get(p.parentName ?? ""));

  return (
    <Modal
      open={open}
      onClose={onCancel}
      zIndexClassName="z-[60]"
      contentClassName="w-[460px] max-w-[calc(100vw-32px)] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{removalTitle(total)}</h3>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{removalSummary(groups)}</p>

      {groups.deleted.length > 0 && (
        <section className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--accent-red)_45%,transparent)]">
          <h4 className={`${GROUP_HEADER} text-[var(--accent-red-text)]`}>
            Deleted from disk · can't undo
          </h4>
          <ul className={GROUP_LIST}>
            {groups.deleted.map((p) => (
              <RemovalCopyRow key={p.name} project={p} label={label(p)} merged={merged} />
            ))}
          </ul>
        </section>
      )}

      {groups.kept.length > 0 && (
        <section className="mt-3 rounded-lg border border-[var(--border)]">
          <h4 className={`${GROUP_HEADER} text-[var(--text-muted)]`}>
            Removed from lpm · folder kept
          </h4>
          <ul className={GROUP_LIST}>
            {groups.kept.map((p) => {
              const root = stripMarker(p.root);
              return (
                <li key={p.name} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
                    {label(p)}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]" title={root}>
                    {middleTruncate(root, 32)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <label className="mt-4 block text-[11px] text-[var(--text-muted)]">
        Type{" "}
        <span className="select-all rounded bg-[var(--bg-hover)] px-1 font-mono text-[var(--text-secondary)]">
          {phrase}
        </span>{" "}
        to confirm
      </label>
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canConfirm) {
            e.preventDefault();
            onConfirm();
          }
        }}
        placeholder={phrase}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
      />

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-85 disabled:opacity-40"
        >
          Delete {total}
        </button>
      </div>
    </Modal>
  );
}
