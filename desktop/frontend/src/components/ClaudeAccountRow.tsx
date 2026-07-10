import { useState } from "react";
import { toast } from "sonner";
import { CopyIcon, TrashIcon } from "./icons";
import { InlineNameEditor } from "./InlineNameEditor";
import type { ClaudeAccountStatus } from "../store/accounts";

interface ClaudeAccountRowProps {
  id: string;
  label: string;
  status?: ClaudeAccountStatus;
  usage: string[];
  onRename: (label: string) => void;
  onSignIn: () => void;
  onDelete: () => void;
}

export function ClaudeAccountRow({
  id,
  label,
  status,
  usage,
  onRename,
  onSignIn,
  onDelete,
}: ClaudeAccountRowProps) {
  const [renaming, setRenaming] = useState(false);
  const signedIn = status?.signedIn ?? false;
  const email = status?.email ?? "";
  const usageLabel = usage.length === 0 ? "Unused" : `${usage.length} project${usage.length === 1 ? "" : "s"}`;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Account id copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <InlineNameEditor
          initial={label}
          commitTitle="Save (Esc to cancel)"
          onCommit={(next) => {
            setRenaming(false);
            onRename(next);
          }}
          onCancel={() => setRenaming(false)}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 text-sm">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          signedIn
            ? "bg-[var(--accent-green)]"
            : "border border-[var(--text-muted)] bg-transparent"
        }`}
        title={signedIn ? "Signed in" : "Not signed in"}
      />
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setRenaming(true)}
          className="max-w-full truncate text-left text-[13px] text-[var(--text-primary)] hover:text-[var(--accent-cyan)]"
          title="Rename"
        >
          {label}
        </button>
        <div className="truncate text-[11px] text-[var(--text-muted)]" title={signedIn ? email : undefined}>
          {signedIn ? email || "Signed in" : "Not signed in"}
        </div>
      </div>
      {!signedIn && (
        <button
          onClick={onSignIn}
          className="shrink-0 rounded-md bg-[var(--accent-green)] px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      )}
      <span
        className="shrink-0 rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] text-[var(--text-muted)]"
        title={usage.length > 0 ? `Used by ${usage.join(", ")}` : "Not assigned to any project"}
      >
        {usageLabel}
      </span>
      <button
        onClick={copyId}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] group-hover:opacity-100"
        title={`Copy account id — ${id}`}
      >
        <CopyIcon size={12} />
      </button>
      <button
        onClick={onDelete}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-red-400"
        title="Remove"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
