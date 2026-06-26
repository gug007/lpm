import { type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { useEventListener } from "../../hooks/useEventListener";
import { useOverlay } from "../../store/overlay";

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
  // When false the modal floats without dimming or capturing pointer events on
  // the page behind it, so the rest of the app stays interactive.
  backdrop?: boolean;
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
  backdrop = true,
  ref,
}: ModalProps) {
  // A blocking modal owns Escape globally; a non-blocking one must not hijack
  // it from the rest of the app, so it handles Escape only when focused (below).
  useEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") onClose();
    },
    document,
    open && closeOnEscape && backdrop,
  );

  useOverlay(open); // park the in-pane browser webview while open (it floats above the DOM)

  if (!open) return null;

  return createPortal(
    <div
      data-modal-overlay
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center ${
        backdrop ? "" : "pointer-events-none"
      } ${containerClassName}`}
    >
      {backdrop && (
        <div
          className={`absolute inset-0 ${backdropClassName}`}
          onClick={closeOnBackdrop ? onClose : undefined}
        />
      )}
      <div
        ref={ref}
        onKeyDown={
          !backdrop && closeOnEscape
            ? (e) => {
                if (e.key === "Escape") onClose();
              }
            : undefined
        }
        className={`relative ${backdrop ? "" : "pointer-events-auto"} ${contentClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
