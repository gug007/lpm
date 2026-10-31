import { DOCS_GROUPS, docsPath } from "@/lib/docs-pages";
import { DOCS_PATH } from "@/lib/links";
import { DocsNavItem } from "./docs-nav-item";

// `current` is the open page's slug; the overview is the empty slug.
export function DocsNavList({
  current,
  className = "",
}: {
  current: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ul className="border-l border-gray-200 dark:border-gray-800">
        <DocsNavItem href={DOCS_PATH} current={current === ""}>
          Overview
        </DocsNavItem>
      </ul>
      {DOCS_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-[12px] font-semibold text-gray-900 dark:text-gray-100">
            {group.title}
          </p>
          <ul className="border-l border-gray-200 dark:border-gray-800">
            {group.pages.map((page) => (
              <DocsNavItem
                key={page.slug}
                href={docsPath(page.slug)}
                current={page.slug === current}
              >
                {page.title}
              </DocsNavItem>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
