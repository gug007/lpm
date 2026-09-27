import { useEffect, useState } from "react";
import { normalizePath } from "../path";
import { FileViewer } from "./FileViewer";
import { FileViewerChoices } from "./FileViewerChoices";
import { Modal } from "./ui/Modal";

interface FileViewerModalProps {
  open: boolean;
  absPath: string;
  line: number;
  col: number;
  projectRoot: string;
  choices?: string[];
  onClose: () => void;
}

// The dialog stays up while a Markdown link swaps the file inside it, so
// closing still hands focus back to the terminal that opened it.
export function FileViewerModal({
  open,
  absPath,
  line,
  col,
  projectRoot,
  choices,
  onClose,
}: FileViewerModalProps) {
  const path = normalizePath(absPath);
  const target = `${path}:${line}:${col}`;
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [target, open]);

  return (
    <Modal
      open={open && !!absPath}
      onClose={onClose}
      closeOnBackdrop={!editing}
      closeOnEscape={!editing}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      {choices && choices.length > 1 ? (
        <FileViewerChoices
          choices={choices}
          line={line}
          col={col}
          projectRoot={projectRoot}
          onClose={onClose}
        />
      ) : (
        <FileViewer
          key={target}
          absPath={path}
          line={line}
          col={col}
          projectRoot={projectRoot}
          editing={editing}
          onEditingChange={setEditing}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
