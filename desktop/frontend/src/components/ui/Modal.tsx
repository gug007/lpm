import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { useEventListener } from "../../hooks/useEventListener";
import { useModalDrag } from "../../hooks/useModalDrag";
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
  // When true the content can be dragged to reposition it by pressing anywhere
  // inside an element marked [data-modal-drag-handle] (e.g. its header).
  draggable?: boolean;
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
  draggable = false,
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

  const contentRef = useRef<HTMLDivElement>(null);
  // Gate on `open` too: the content element is created/destroyed with it, so the
  // drag hook re-measures and re-observes the fresh node each time it reopens.
  const drag = useModalDrag(contentRef, draggable && open);

  // Re-center each time the modal opens, so a position from a previous open
  // doesn't linger.
  useEffect(() => {
    if (open) drag.reset();
  }, [open, drag.reset]);

  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
    },
    [ref],
  );

  if (!open) return null;

  // Only style while actually moved/dragging: an idle draggable modal then
  // behaves exactly like a non-draggable one (no transform → no GPU layer, no
  // per-render style churn).
  const moved = drag.offset.x !== 0 || drag.offset.y !== 0;
  const dragStyle: CSSProperties | undefined =
    draggable && (moved || drag.dragging)
      ? {
          transform: moved
            ? `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)`
            : undefined,
          touchAction: drag.dragging ? "none" : undefined,
        }
      : undefined;

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
        ref={setContentRef}
        onKeyDown={
          !backdrop && closeOnEscape
            ? (e) => {
                if (e.key === "Escape") onClose();
              }
            : undefined
        }
        onPointerDown={draggable ? drag.onPointerDown : undefined}
        style={dragStyle}
        className={`relative ${backdrop ? "" : "pointer-events-auto"} ${contentClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
