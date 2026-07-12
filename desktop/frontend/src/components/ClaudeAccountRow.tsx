import { useState } from "react";
import { toast } from "../toast";
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
    <div className="group flex min-h-16 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-hover)]/70">
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[12px] font-semibold uppercase text-[var(--text-secondary)]">
        {label.charAt(0)}
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-primary)] ${
            signedIn ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"
          }`}
          title={signedIn ? "Signed in" : "Not signed in"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setRenaming(true)}
          className="max-w-full truncate text-left text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--accent-cyan)]"
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
          className="shrink-0 rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
        >
          Sign in
        </button>
      )}
      <span
        className="shrink-0 rounded-full bg-[var(--bg-active)] px-2 py-1 text-[10px] text-[var(--text-muted)]"
        title={usage.length > 0 ? `Used by ${usage.join(", ")}` : "Not assigned to any project"}
      >
        {usageLabel}
      </span>
      <button
        onClick={copyId}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--bg-active)] hover:text-[var(--text-secondary)] focus:opacity-100 group-hover:opacity-100"
        title={`Copy account id — ${id}`}
        aria-label={`Copy ${label} account id`}
      >
        <CopyIcon size={12} />
      </button>
      <button
        onClick={onDelete}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-red-400"
        title="Remove"
        aria-label={`Remove ${label} account`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
