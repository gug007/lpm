import type { ReactNode } from "react";

export const SIDE_ROW =
  "rounded-md px-2 py-1.5 text-[14px] text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white";

export function SideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
