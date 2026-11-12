"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import {
  DOCS_LINK,
  DOCS_LINK_ACTIVE,
  DOCS_LINK_INACTIVE,
} from "./docs-nav-styles";

type Entry = { id: string; label: string; level: 2 | 3 };

// The page's own linkable headings, so the outline can't drift from them.
const HEADINGS = "[data-docs-content] :is(h2, h3)[id]";
// Just under the sticky nav: the last heading above this line is the part
// being read.
const READING_LINE = 120;

function entryOf(heading: HTMLElement): Entry {
  return {
    id: heading.id,
    label: (
      heading.querySelector("[data-heading-label]") ?? heading
    ).textContent!.trim(),
    level: heading.tagName === "H3" ? 3 : 2,
  };
}

function useOutline() {
  const pathname = usePathname();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    let headings: HTMLElement[] = [];
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > READING_LINE) break;
        current = heading.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(() => {
      headings = Array.from(document.querySelectorAll<HTMLElement>(HEADINGS));
      setEntries(headings.map(entryOf));
      update();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return { entries, active };
}

// In the docs menu the outline sits inside a <details> that would otherwise
// stay open over the part the reader just jumped to.
const closeMenu = (event: MouseEvent<HTMLAnchorElement>) =>
  event.currentTarget.closest("details")?.removeAttribute("open");

export function DocsOutline({ inMenu = false }: { inMenu?: boolean }) {
  const { entries, active } = useOutline();
  if (entries.length < 2) return null;

  return (
    <nav aria-label="On this page" className={inMenu ? "mb-6" : undefined}>
      <p className="mb-1.5 text-[12px] font-semibold text-gray-900 dark:text-gray-100">
        On this page
      </p>
      <ul className="border-l border-gray-200 dark:border-gray-800">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              aria-current={entry.id === active ? "location" : undefined}
              onClick={inMenu ? closeMenu : undefined}
              className={`${DOCS_LINK} ${entry.level === 3 ? "pl-6" : "pl-3"} ${
                entry.id === active ? DOCS_LINK_ACTIVE : DOCS_LINK_INACTIVE
              }`}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
