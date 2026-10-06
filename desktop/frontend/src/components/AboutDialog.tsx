import { useEffect, useState } from "react";
import { GetVersion } from "../../bridge/commands";
import { Modal } from "./ui/Modal";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    GetVersion()
      .then((v) => {
        if (alive) setVersion(String(v));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      contentClassName="w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 text-center shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">lpm</h3>
      <p className="mt-1 min-h-4 select-text text-xs text-[var(--text-secondary)]">
        {version && `Version ${version}`}
      </p>
      <p className="mt-3 text-[11px] text-[var(--text-muted)]">© {new Date().getFullYear()}</p>
      <button
        autoFocus
        onClick={onClose}
        className="mt-5 rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        OK
      </button>
    </Modal>
  );
}
