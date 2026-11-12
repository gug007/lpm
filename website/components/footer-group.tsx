"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { FooterLink } from "@/lib/footer-links";

type Props = {
  heading: string;
  links: FooterLink[];
  headingClassName: string;
  linkClassName: string;
  listClassName: string;
  className?: string;
};

// On a phone the footer's link lists run to two screens, so each group folds
// under its heading there. The links stay in the page either way, and from sm
// up the group is the plain open list it always was.
export function FooterGroup({
  heading,
  links,
  headingClassName,
  linkClassName,
  listClassName,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <nav
      aria-label={heading}
      className={`max-sm:border-b max-sm:border-gray-200 max-sm:dark:border-gray-800 ${className}`}
    >
      <h2 className={headingClassName}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 text-left uppercase tracking-widest sm:hidden"
        >
          {heading}
          <span className="inline-flex items-center gap-1.5 font-normal tabular-nums tracking-normal text-gray-400 dark:text-gray-500">
            {links.length}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </button>
        <span className="hidden sm:inline">{heading}</span>
      </h2>
      <ul
        id={listId}
        className={`${open ? "max-sm:pb-4" : "max-sm:hidden"} ${listClassName}`}
      >
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} prefetch={false} className={linkClassName}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
