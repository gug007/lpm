import type { ReactNode } from "react";

// Each section is a docs page of its own, so its title is the page's h1.
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article>
      <h1 className="text-balance text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h1>
      {description && (
        <div className="mt-4 text-pretty text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
          {description}
        </div>
      )}
      <div className="mt-8">{children}</div>
    </article>
  );
}
