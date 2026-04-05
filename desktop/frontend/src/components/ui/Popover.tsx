import type { ReactNode, Ref } from "react";
import { useOutsideClick } from "../../hooks/useOutsideClick";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function Popover({
  open,
  onClose,
  children,
  className = "",
  ref,
}: PopoverProps) {
  const outsideRef = useOutsideClick<HTMLDivElement>(onClose, open);

  if (!open) return null;

  return (
    <div
      ref={(node) => {
        outsideRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={className}
    >
      {children}
    </div>
  );
}
