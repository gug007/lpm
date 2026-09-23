import Link from "next/link";
import type { ReactNode } from "react";

export function DocLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const className =
    "text-gray-600 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
