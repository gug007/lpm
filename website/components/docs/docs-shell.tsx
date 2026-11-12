import type { ReactNode } from "react";
import { DocsMobileNav } from "./docs-mobile-nav";
import { DocsNavList } from "./docs-nav-list";
import { DocsOutline } from "./docs-outline";

// "On this page" sits in the margin right of the column, so the docs stay
// aligned with the nav above them; it appears once that margin fits it.
export function DocsShell({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-20 sm:pt-28 lg:flex lg:gap-12">
      <aside className="hidden lg:block lg:w-48 lg:shrink-0">
        <nav
          aria-label="Docs"
          className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6"
        >
          <DocsNavList current={current} className="space-y-6" />
        </nav>
      </aside>
      <div data-docs-content className="min-w-0 lg:max-w-3xl lg:flex-1">
        <DocsMobileNav current={current} />
        {children}
      </div>
      <div className="absolute inset-y-0 left-full hidden w-44 pt-28 pb-20 pl-5 min-[1440px]:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6">
          <DocsOutline />
        </div>
      </div>
    </div>
  );
}
