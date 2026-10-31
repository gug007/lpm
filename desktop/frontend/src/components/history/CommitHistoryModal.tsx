import { Modal } from "../ui/Modal";
import { CommitHistoryBody } from "./CommitHistoryBody";

interface CommitHistoryModalProps {
  open: boolean;
  projectPath: string;
  branch: string;
  onClose: () => void;
}

/** The branch's commits, newest first, with what each one changed. */
export function CommitHistoryModal({ open, projectPath, branch, onClose }: CommitHistoryModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[110]"
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="flex h-[85vh] w-[min(1200px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <CommitHistoryBody projectPath={projectPath} branch={branch} onClose={onClose} />
    </Modal>
  );
}
