import type { ReactNode } from "react";
import { DocsMobileNav } from "./docs-mobile-nav";
import { DocsNavList } from "./docs-nav-list";

export function DocsShell({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 pt-24 pb-20 sm:pt-28 lg:flex lg:gap-12">
      <aside className="hidden lg:block lg:w-48 lg:shrink-0">
        <nav
          aria-label="Docs"
          className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6"
        >
          <DocsNavList current={current} className="space-y-6" />
        </nav>
      </aside>
      <div className="min-w-0 lg:max-w-3xl lg:flex-1">
        <DocsMobileNav current={current} />
        {children}
      </div>
    </div>
  );
}
