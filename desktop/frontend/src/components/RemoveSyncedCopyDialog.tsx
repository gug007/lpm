import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { followStop } from "../followApi";
import { useAppStore } from "../store/app";

// Removing a synced copy: stop the syncing, then let the folder go.
//
// Unlike removing a project, nothing here is one of a kind — the work lives on the
// other Mac, and the copy can be made again with one click — so this asks once and
// does not make the user type the name. What it must say plainly is that the other
// Mac keeps everything.
export function RemoveSyncedCopyDialog({
  open,
  project,
  macName,
  onClose,
}: {
  open: boolean;
  project: string;
  macName: string;
  onClose: () => void;
}) {
  const removeFromDisk = useAppStore((s) => s.removeProjectFromDisk);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      // Stop first: a record left pointing at a folder that is going away would
      // have the scheduler sync into nothing.
      await followStop(project);
      await removeFromDisk(project);
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Remove synced copy"
      variant="destructive"
      confirmLabel={busy ? "Removing…" : "Remove copy"}
      disabled={busy}
      body={
        <>
          Remove <span className="font-medium text-[var(--text-primary)]">{project}</span> and move
          its folder to the Trash? Syncing stops.
          <span className="mt-2 block">
            Nothing on <span className="font-medium text-[var(--text-primary)]">{macName}</span>{" "}
            changes, and you can sync it here again any time.
          </span>
        </>
      }
      onCancel={onClose}
      onConfirm={() => void remove()}
    />
  );
}
