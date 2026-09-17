import { toast } from "sonner";
import { RevealInFinder, SetClipboardText } from "../../../bridge/commands";
import { stripMarker } from "../../peer/markers";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSeparator } from "../ui/ContextMenuSeparator";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import type { RowTarget } from "./FilesRow";

interface FilesRowMenuProps {
  target: RowTarget;
  absPath: string;
  onOpen: () => void;
  onClose: () => void;
}

export function FilesRowMenu({ target, absPath, onOpen, onClose }: FilesRowMenuProps) {
  const copy = (text: string) =>
    SetClipboardText(text)
      .then(() => toast.success("Copied"))
      .catch((err: unknown) => toast.error(String(err)));
  const reveal = () => RevealInFinder(absPath).catch((err: unknown) => toast.error(String(err)));
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
        onClick={() => {
          void copy(stripMarker(absPath));
          onClose();
        }}
      />
      <ContextMenuItem
        label="Copy relative path"
        onClick={() => {
          void copy(target.path);
          onClose();
        }}
      />
      <ContextMenuItem
        label="Reveal in Finder"
        onClick={() => {
          void reveal();
          onClose();
        }}
      />
    </ContextMenuShell>
  );
}
