import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ContextMenuShell } from "./ui/ContextMenuShell";

type Place = { x: number; y: number; anchor?: undefined } | { anchor: HTMLElement; x?: undefined; y?: undefined };

// Keep a machine awake while agents work, for a set time, or until turned off:
// the panel it is given, popped up as a menu.
export function KeepAwakeMenu({
  place,
  align,
  trigger,
  onClose,
  children,
}: {
  place: Place;
  align?: "start" | "end";
  trigger?: HTMLElement;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <ContextMenuShell {...place} align={align} trigger={trigger} minWidth={300} onClose={onClose}>
      {children}
    </ContextMenuShell>,
    document.body,
  );
}
