import type { ReactNode } from "react";
import { DocsHeading } from "@/components/docs/docs-heading";
import { slugify } from "@/lib/slug";

type Props = { children: ReactNode } & (
  | { title: string; className?: never }
  | { title?: undefined; className: string }
);

// A titled lede opens a part of the page, so its title is a linkable heading
// that "On this page" lists; an untitled one is a short note between examples.
export function Lede({ title, children, className }: Props) {
  if (title) {
    return (
      <>
        <DocsHeading id={slugify(title)}>{title}</DocsHeading>
        <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {children}
        </p>
      </>
    );
  }
  return (
    <p
      className={`${className} text-xs text-gray-500 dark:text-gray-400 leading-relaxed`}
    >
      {children}
    </p>
  );
}
