import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { FILE_CHORDS, copyAbsolutePath, copyText, revealInFinder } from "./fileActions";
import type { RowTarget } from "./FilesRow";

interface FilesRowMenuProps {
  target: RowTarget;
  absPath: string;
  onOpen: () => void;
  onClose: () => void;
}

export function FilesRowMenu({ target, absPath, onOpen, onClose }: FilesRowMenuProps) {
  return (
    <ContextMenuShell x={target.x} y={target.y} minWidth={180} onClose={onClose}>
      <ContextMenuItem
        label={target.isDir ? "Open folder" : "Open"}
        onClick={() => {
          onOpen();
          onClose();
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuItem
        label="Copy path"
        shortcut={FILE_CHORDS.copyPath}
        onClick={() => {
          void copyAbsolutePath(absPath);
          onClose();
        }}
      />
      <ContextMenuItem
        label="Copy relative path"
        shortcut={FILE_CHORDS.copyRelativePath}
        onClick={() => {
          void copyText(target.path);
          onClose();
        }}
      />
      <ContextMenuItem
        label="Reveal in Finder"
        shortcut={FILE_CHORDS.reveal}
        onClick={() => {
          void revealInFinder(absPath);
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
