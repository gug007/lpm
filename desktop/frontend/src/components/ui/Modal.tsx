import { type ReactNode, type Ref } from "react";
import { useEventListener } from "../../hooks/useEventListener";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  backdropClassName?: string;
  containerClassName?: string;
  contentClassName?: string;
  zIndexClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function Modal({
  open,
  onClose,
  children,
  backdropClassName = "bg-black/40",
  containerClassName = "",
  contentClassName = "",
  zIndexClassName = "z-50",
  closeOnBackdrop = true,
  closeOnEscape = true,
  ref,
}: ModalProps) {
  useEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") onClose();
    },
    document,
    open && closeOnEscape,
  );

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center ${containerClassName}`}
    >
      <div
        className={`absolute inset-0 ${backdropClassName}`}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div ref={ref} className={`relative ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}
