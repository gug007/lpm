import type { ReactNode } from "react";

export function Section({
  id,
  title,
  description,
  children,
  last = false,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${last ? "" : "mb-12"}`}>
      <h2 className="text-lg font-semibold mb-2">
        {id ? (
          <a href={`#${id}`} className="group inline-flex items-center gap-2">
            <span>{title}</span>
            <span
              aria-hidden
              className="text-gray-300 dark:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
            >
              #
            </span>
          </a>
        ) : (
          title
        )}
      </h2>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}
