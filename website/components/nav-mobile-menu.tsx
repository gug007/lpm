"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CHANGELOG_PATH,
  DOCS_PATH,
  FEATURES_PATH,
  LESSONS_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  VS_BASE_PATH,
  WORKTREE_AGENTS_PATH,
  vsPath,
} from "@/lib/links";
import { NavMobileGet } from "./nav-mobile-get";
import { NavMobileGroup, type NavMobileGroupSpec } from "./nav-mobile-group";

const PANEL_ID = "nav-mobile-panel";

type MenuLink = NavMobileGroupSpec["links"][number];

const PRODUCT: MenuLink[] = [
  { href: FEATURES_PATH, label: "Features" },
  { href: DOCS_PATH, label: "Docs" },
  { href: LESSONS_PATH, label: "Lessons" },
  { href: MOBILE_PATH, label: "iPhone app" },
  { href: CHANGELOG_PATH, label: "Changelog" },
];

const GUIDES: MenuLink[] = [
  { href: AI_AGENTS_PATH, label: "Claude Code and Codex" },
  { href: PARALLEL_PATH, label: "Run Claude Code in parallel" },
  { href: AUTOMATIONS_PATH, label: "Schedule agent tasks" },
  { href: WORKTREE_AGENTS_PATH, label: "Git worktrees for agents" },
];

const COMPARE: MenuLink[] = [
  { href: vsPath("tmux"), label: "tmux" },
  { href: vsPath("iterm2"), label: "iTerm2" },
  { href: vsPath("pm2"), label: "PM2" },
  { href: vsPath("cmux"), label: "cmux" },
  { href: VS_BASE_PATH, label: "All" },
];

const LINK =
  "inline-flex w-fit items-center min-h-11 text-[15px] transition-colors duration-200";
const CHIP =
  "inline-flex min-h-9 items-center rounded-full border border-gray-200 px-3.5 text-[14px] transition-colors duration-200 dark:border-gray-800";

const GROUPS: NavMobileGroupSpec[] = [
  { title: "Product", links: PRODUCT, listClassName: "grid grid-cols-2 gap-x-6", linkClassName: LINK },
  { title: "Guides", links: GUIDES, listClassName: "flex flex-col", linkClassName: LINK },
  {
    title: "Compare lpm with",
    links: COMPARE,
    listClassName: "mt-1.5 flex flex-wrap gap-2",
    linkClassName: CHIP,
  },
];

export function NavMobileMenu({ github }: { github: ReactNode }) {
  const [open, setOpen] = useState(false);
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

  // Any link closes the menu, including ones that stay on this page (the
  // download section, another site) where the path never changes.
  const closeOnLink = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("a")) setOpen(false);
  };

  // The panel covers the page, so Tab past its last link would land on
  // controls hidden underneath; leaving it by keyboard closes it instead. A
  // tap on the panel's background moves focus nowhere and keeps it open.
  const closeOnFocusOut = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !containerRef.current?.contains(next)) setOpen(false);
  };

  return (
    <div ref={containerRef} onBlur={closeOnFocusOut} className="contents">
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((v) => !v)}
        className="md:hidden relative inline-flex h-9 w-9 items-center after:absolute after:-inset-1 after:content-[''] justify-center rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer transition-colors duration-200"
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
          onClick={closeOnLink}
          className="md:hidden absolute top-14 left-0 right-0 max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-b border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-[#111] px-6 pb-[env(safe-area-inset-bottom)]"
        >
          {GROUPS.map((group) => (
            <NavMobileGroup key={group.title} {...group} />
          ))}
          <NavMobileGet github={github} />
        </div>
      )}
    </div>
  );
}
