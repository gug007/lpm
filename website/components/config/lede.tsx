import type { ReactNode } from "react";
import { Strong } from "./strong";

export function Lede({
  title,
  children,
  className = "mt-8 mb-3",
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`${className} text-xs text-gray-500 dark:text-gray-400 leading-relaxed`}
    >
      {title && (
        <>
          <Strong>{title}</Strong>{" "}
        </>
      )}
      {children}
    </p>
  );
}
