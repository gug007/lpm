"use client";

import { useEffect, useRef, type ReactNode } from "react";

export const MENU_PANEL_CLASS =
  "menu-pop fixed z-[70] overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-lg";

/** Backdrop + dismissal wiring shared by every popup menu in the demo. */
export function MenuLayer({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    // The menu sits at coordinates captured on open, so a scroll that moves its
    // trigger strands it. Only scrollers that contain the trigger count — the
    // terminal panes stream output and scroll themselves constantly.
    const onScroll = (e: Event) => {
      const anchor = anchorRef.current;
      const target = e.target as Node | null;
      if (!anchor || !target || !target.contains(anchor)) return;
      onClose();
    };
    const dismiss = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [onClose]);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Close menu"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-[65] cursor-default"
      />
      {children}
    </>
  );
}
