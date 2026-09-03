"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
};

// Most pages end in their own download section, so a plain "/#download" sends a
// reader who is already on the right page back to the home page to convert.
// The href stays absolute so it still works without JS and on the few pages
// that have no download section (docs, legal); the click handler keeps the
// reader in place whenever the section is actually on the page.
export function DownloadLink({ className, children }: Props) {
  const keepReaderOnPage = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const section = document.getElementById("download");
    if (!section) return;

    event.preventDefault();
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    section.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", "#download");
  };

  return (
    <Link
      href="/#download"
      prefetch={false}
      className={className}
      onClick={keepReaderOnPage}
    >
      {children}
    </Link>
  );
}
