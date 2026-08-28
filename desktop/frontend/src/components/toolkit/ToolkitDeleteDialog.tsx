import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteAgentSkill, PreviewAgentSkillDelete } from "../../../bridge/commands";
import type { AgentCapability } from "../../toolkit";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface SkillRemoval {
  dir: string;
  name: string;
  files: number;
  bytes: number;
  extras: string[];
  extraCount: number;
  truncated: boolean;
}

interface ToolkitDeleteDialogProps {
  cwd: string;
  cap: AgentCapability;
  siblingPaths: string[];
  open: boolean;
  onCancel: () => void;
  onDeleted: () => void;
}

// `total` is counted separately from the names, which arrive capped: the one
// line whose job is to say what else goes must not undercount it.
const joined = (items: string[], keep: number, total = items.length) => {
  const shown = items.slice(0, keep);
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ");
};

export function ToolkitDeleteDialog({
  cwd,
  cap,
  siblingPaths,
  open,
  onCancel,
  onDeleted,
}: ToolkitDeleteDialogProps) {
  const [plan, setPlan] = useState<SkillRemoval | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);

  // The dialog opens first and fills in after, so a refusal is read before the
  // user can commit rather than arriving as a toast once the folder is gone.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlan(null);
    setPreviewError("");
    void (async () => {
      try {
        const preview = (await PreviewAgentSkillDelete(cwd, cap.path)) as SkillRemoval;
        if (live) setPlan(preview);
      } catch (err) {
        if (live) setPreviewError(String(err));
      }
    })();
    return () => {
      live = false;
    };
  }, [open, cwd, cap.path]);

  const remove = async () => {
    setBusy(true);
    try {
      await DeleteAgentSkill(cwd, cap.path);
      toast.success(`Moved ${cap.name} to the Trash`);
      onDeleted();
    } catch (err) {
      toast.error(String(err));
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  const name = <span className="font-medium text-[var(--text-primary)]">{cap.name}</span>;
  const extras = plan?.extras ?? [];

  // A capped walk can report one file and still have missed a deep tree, so it
  // falls back to the unnumbered sentence rather than claiming "0 files".
  const others = plan ? Math.max(0, plan.files - 1) : 0;
  const headline =
    !plan || (plan.truncated && others === 0) ? (
      <>{name} and everything in its folder moves to the Trash.</>
    ) : others === 0 ? (
      <>{name} moves to the Trash.</>
    ) : (
      <>
        {name} and {plan.truncated ? "at least " : ""}
        {others === 1 ? "1 other file" : `${others} other files`} in its folder move to the
        Trash.
      </>
    );

  const body = previewError ? (
    previewError
  ) : (
    <>
      <p>{headline}</p>
      {extras.length > 0 && (
        <p className="mt-2">Also going: {joined(extras, 4, plan?.extraCount)}.</p>
      )}
      {cap.scope === "project" && <p className="mt-2">This changes the project's files.</p>}
      {siblingPaths.length > 0 && (
        <p className="mt-2">
          A copy with this name is also in {joined(siblingPaths, 2)} —{" "}
          {siblingPaths.length === 1 ? "that one stays" : "those stay"}.
        </p>
      )}
      <p className="mt-2">You can restore it from the Trash.</p>
    </>
  );

  return (
    <ConfirmDialog
      open={open}
      title="Delete this skill?"
      body={body}
      confirmLabel="Delete"
      variant="destructive"
      disabled={busy || plan === null || Boolean(previewError)}
      onCancel={onCancel}
      onConfirm={() => void remove()}
    />
  );
}
