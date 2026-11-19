import { Fragment } from "react";
import { DocLink } from "@/components/config/doc-link";

type More = { href: string; label: string };

export function GuideMore({ links }: { links: More[] }) {
  return (
    <p className="mt-10 border-t border-gray-200 pt-5 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:text-gray-400">
      Read more:{" "}
      {links.map(({ href, label }, i) => (
        <Fragment key={href}>
          {i > 0 && (i === links.length - 1 ? " and " : ", ")}
          <DocLink href={href}>{label}</DocLink>
        </Fragment>
      ))}
      .
    </p>
  );
}
