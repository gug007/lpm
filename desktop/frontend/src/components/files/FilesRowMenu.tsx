import { trashName } from "../../platform";
import { TrashIcon, UndoIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { FILE_CHORDS, copyAbsolutePath, copyText, revealInFinder } from "./fileActions";
import { FilesOpenWithSubmenu } from "./FilesOpenWithSubmenu";
import type { RowTarget } from "./FilesRow";
import { mentionInAgent, mentionTarget } from "./mentionInAgent";
import { folderFor } from "./treeEdits";
import type { TreeEdits } from "./useTreeEdits";
import { revealLabel } from "../../machineWords";
import { FilesSyncItems } from "../ignored/FilesSyncItems";

const NO_TERMINAL = "Open a terminal in this project to mention files in it";

interface FilesRowMenuProps {
  target: RowTarget;
  absPath: string;
  projectName: string;
  onOpen: () => void;
  // Left out where the tree can't be changed, as in the commit review.
  edits?: TreeEdits;
  // Given only when the row holds uncommitted changes.
  onDiscard?: () => void;
  // The row is ignored by git, or inside a folder that is.
  ignored?: boolean;
  onClose: () => void;
}

export function FilesRowMenu({
  target,
  absPath,
  projectName,
  onOpen,
  edits,
  onDiscard,
  ignored = false,
  onClose,
}: FilesRowMenuProps) {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const blocked = edits?.blocked ?? undefined;
  const terminal = mentionTarget(projectName);
  return (
    <ContextMenuShell x={target.x} y={target.y} minWidth={200} onClose={onClose}>
      <ContextMenuItem label={target.isDir ? "Open folder" : "Open"} onClick={run(onOpen)} />
      {!target.isDir && <FilesOpenWithSubmenu absPath={absPath} onClose={onClose} />}
      <ContextMenuItem
        label="Mention in agent"
        disabled={!terminal}
        title={terminal ? `Add @${target.path} to ${terminal.label || "the agent"}'s input` : NO_TERMINAL}
        onClick={run(() => terminal && mentionInAgent(projectName, terminal, target.path))}
      />
      {edits && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            label="New file…"
            disabled={!!blocked}
            title={blocked}
            onClick={run(() => edits.create(folderFor(target), false))}
          />
          <ContextMenuItem
            label="New folder…"
            disabled={!!blocked}
            title={blocked}
            onClick={run(() => edits.create(folderFor(target), true))}
          />
          <ContextMenuItem
            label="Rename…"
            disabled={!!blocked}
            title={blocked}
            onClick={run(() => edits.rename(target))}
          />
          <ContextMenuItem
            label={`Move to ${trashName()}`}
            icon={<TrashIcon />}
            shortcut={FILE_CHORDS.trash}
            disabled={!!blocked}
            title={blocked}
            onClick={run(() => edits.trash(target))}
          />
        </>
      )}
      <FilesSyncItems
        projectName={projectName}
        path={target.path}
        isDir={target.isDir}
        ignored={ignored}
        onClose={onClose}
      />
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Copy path"
        shortcut={FILE_CHORDS.copyPath}
        onClick={run(() => void copyAbsolutePath(absPath))}
      />
      <ContextMenuItem
        label="Copy relative path"
        shortcut={FILE_CHORDS.copyRelativePath}
        onClick={run(() => void copyText(target.path))}
      />
      <ContextMenuItem
        label={revealLabel()}
        shortcut={FILE_CHORDS.reveal}
        onClick={run(() => void revealInFinder(absPath))}
      />
      {onDiscard && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            label={target.isDir ? "Discard changes in folder" : "Discard changes"}
            icon={<UndoIcon />}
            destructive
            onClick={run(onDiscard)}
          />
        </>
      )}
    </ContextMenuShell>
  );
}
