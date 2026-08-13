"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AI_AGENTS_PATH, VS_BASE_PATH } from "@/lib/links";
import { NavLink } from "./nav-link";

const PANEL_ID = "nav-mobile-panel";
const linkClass =
  "inline-flex w-fit items-center min-h-11 text-sm transition-colors duration-200";

export function NavMobileMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [shownPath, setShownPath] = useState(pathname);

  if (pathname !== shownPath) {
    setShownPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="contents">
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((v) => !v)}
        className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors duration-200"
      >
        {open ? (
          <X className="w-[18px] h-[18px]" />
        ) : (
          <Menu className="w-[18px] h-[18px]" />
        )}
      </button>
      {open && (
        <div
          id={PANEL_ID}
          className="md:hidden absolute top-14 left-0 right-0 border-t border-gray-200/70 dark:border-gray-800/70 bg-white/90 dark:bg-[#111]/90 backdrop-blur-lg px-6 py-2 flex flex-col"
        >
          <NavLink href={AI_AGENTS_PATH} onClick={close} className={linkClass}>
            For AI agents
          </NavLink>
          <NavLink href={VS_BASE_PATH} onClick={close} className={linkClass}>
            Compare
          </NavLink>
        </div>
      )}
    </div>
  );
}
