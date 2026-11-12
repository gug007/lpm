import Link from "next/link";
import {
  DOCS_LINK,
  DOCS_LINK_ACTIVE,
  DOCS_LINK_INACTIVE,
} from "./docs-nav-styles";

export function DocsNavItem({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={`${DOCS_LINK} pl-3 ${current ? DOCS_LINK_ACTIVE : DOCS_LINK_INACTIVE}`}
      >
        {children}
      </Link>
    </li>
  );
}
