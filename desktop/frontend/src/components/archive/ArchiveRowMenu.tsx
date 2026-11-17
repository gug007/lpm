import { ClipboardCopy, FolderOpen, HardDrive, Sparkles, Trash2 } from "lucide-react";
import { RevealInFinder, SetClipboardText } from "../../../bridge/commands";
import { revealLabel } from "../../machineWords";
import { toast } from "../../notifications/toast";
import { stripMarker } from "../../peer/markers";
import { trashName } from "../../platform";
import type { ArchivedProject } from "../../projectArchive";
import { formatBytes } from "../../syncApi";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";

interface ArchiveRowMenuProps {
  project: ArchivedProject;
  anchor: HTMLElement;
  // What Free space would move to the Trash; 0 hides the item.
  rebuildable: number;
  onFree: () => void;
  onRemove: () => void;
  onTrash: () => void;
  onClose: () => void;
}

/** A row's lesser actions: its folder, the space it can give back, and the two
 *  ways to remove it, as the sidebar's project menu has them. */
export function ArchiveRowMenu({
  project: p,
  anchor,
  rebuildable,
  onFree,
  onRemove,
  onTrash,
  onClose,
}: ArchiveRowMenuProps) {
  const path = stripMarker(p.root);
  const close = (run: () => void) => () => {
    onClose();
    run();
  };
  const copyPath = async () => {
    try {
      await SetClipboardText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  // The folder is on this machine's disk only for its own local projects.
  const here = p.machine === "" && !p.isRemote;

  return (
    <ContextMenuShell anchor={anchor} trigger={anchor} align="end" minWidth={210} onClose={onClose}>
      {here && (
        <ContextMenuItem
          label={revealLabel()}
          icon={<FolderOpen size={14} />}
          onClick={close(() => void RevealInFinder(path))}
        />
      )}
      {path && (
        <ContextMenuItem
          label="Copy path"
          icon={<ClipboardCopy size={14} />}
          onClick={close(() => void copyPath())}
        />
      )}
      {rebuildable > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            label={`Free ${formatBytes(rebuildable)}…`}
            icon={<Sparkles size={14} />}
            onClick={close(onFree)}
          />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Remove from lpm…"
        icon={<Trash2 size={14} />}
        destructive
        onClick={close(onRemove)}
      />
      {!p.isRemote && (
        <ContextMenuItem
          label={`Move folder to ${trashName()}…`}
          icon={<HardDrive size={14} />}
          destructive
          onClick={close(onTrash)}
        />
      )}
    </ContextMenuShell>
  );
}
