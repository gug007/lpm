import { useEffect, useState } from "react";
import { normalizePath } from "../path";
import type { FileViewerMode } from "../store/fileViewer";
import { FileViewer } from "./FileViewer";
import { FileViewerChoices } from "./FileViewerChoices";
import type { FileViewerLayout } from "./fileViewerLayout";
import { Modal } from "./ui/Modal";

interface FileViewerModalProps {
  open: boolean;
  absPath: string;
  line: number;
  col: number;
  projectRoot: string;
  onHost?: boolean;
  choices?: string[];
  layout?: FileViewerLayout;
  overDialog?: boolean;
  onClose: () => void;
}

// Minimized it floats above the bottom-right of the app, docked it takes the
// window's right edge. Both keep the dialog mounted, so a video keeps playing.
const PLACEMENT: Record<FileViewerMode, { container: string; content: string }> = {
  open: {
    container: "",
    content:
      "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl",
  },
  minimized: {
    container: "items-end justify-end p-4 pb-24",
    content:
      "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl",
  },
  docked: {
    container: "items-stretch justify-end",
    content: "border-l border-[var(--border)] bg-[var(--bg-primary)]",
  },
};

// The dialog stays up while a Markdown link swaps the file inside it, so
// closing still hands focus back to the terminal that opened it.
export function FileViewerModal({
  open,
  absPath,
  line,
  col,
  projectRoot,
  onHost,
  choices,
  layout,
  overDialog,
  onClose,
}: FileViewerModalProps) {
  const path = normalizePath(absPath);
  const target = `${path}:${line}:${col}`;
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [target, open]);
  const mode = layout?.mode ?? "open";
  const placement = PLACEMENT[mode];

  return (
    <Modal
      open={open && !!absPath}
      onClose={onClose}
      closeOnBackdrop={!editing}
      closeOnEscape={!editing && mode === "open"}
      passive={mode !== "open"}
      draggable={mode === "minimized"}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      zIndexClassName={overDialog ? "z-[70]" : undefined}
      containerClassName={placement.container}
      contentClassName={placement.content}
    >
      {choices && choices.length > 1 ? (
        <FileViewerChoices
          choices={choices}
          line={line}
          col={col}
          projectRoot={projectRoot}
          onHost={onHost}
          onClose={onClose}
        />
      ) : (
        <FileViewer
          key={target}
          absPath={path}
          line={line}
          col={col}
          projectRoot={projectRoot}
          onHost={onHost}
          editing={editing}
          onEditingChange={setEditing}
          layout={layout}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
