import Link from "next/link";

const LINK = "block -ml-px border-l py-1 pl-3 text-[13px] transition-colors";
const ACTIVE =
  "border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white";
const INACTIVE =
  "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-white";

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
        className={`${LINK} ${current ? ACTIVE : INACTIVE}`}
      >
        {children}
      </Link>
    </li>
  );
}
