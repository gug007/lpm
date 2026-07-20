import { Modal } from "./ui/Modal";
import { UsageView } from "./UsageView";

interface UsageModalProps {
  open: boolean;
  onClose: () => void;
}

export function UsageModal({ open, onClose }: UsageModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="flex max-h-[85vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] px-6 pb-6 pt-5 shadow-2xl"
    >
      <UsageView onClose={onClose} />
    </Modal>
  );
}
