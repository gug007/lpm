"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const INACTIVE =
  "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white";
const ACTIVE = "text-gray-900 dark:text-white";

type Props = {
  href: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
};

export function NavLink({ href, className, onClick, children }: Props) {
  const pathname = usePathname();
  const active =
    !href.includes("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[className, active ? ACTIVE : INACTIVE]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Link>
  );
}
