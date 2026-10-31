import type { ReactNode } from "react";

export function DocsHeading({
  id,
  level = 2,
  children,
}: {
  id: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag
      id={id}
      className={`scroll-mt-24 font-semibold tracking-tight text-gray-900 dark:text-white ${
        level === 2 ? "mt-12 mb-3 text-lg" : "mt-6 mb-2.5 text-[15px]"
      }`}
    >
      <a href={`#${id}`} className="group inline-flex items-center gap-2">
        {children}
        <span
          aria-hidden
          className="text-sm text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-700"
        >
          #
        </span>
      </a>
    </Tag>
  );
}
