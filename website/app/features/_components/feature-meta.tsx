import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Feature } from "./feature-types";
import ScopeBadge from "./scope-badge";

type Props = Pick<Feature, "scope" | "href" | "linkLabel"> & {
  className?: string;
  stacked?: boolean;
};

export default function FeatureMeta({
  scope,
  href,
  linkLabel,
  className = "",
  stacked = false,
}: Props) {
  if (!scope && !href) return null;
  const layout = stacked
    ? "flex flex-col items-start gap-1"
    : "flex flex-wrap items-center gap-x-4 gap-y-1";
  return (
    <div className={`${layout} ${className}`}>
      {scope && <ScopeBadge scope={scope} />}
      {href && (
        <Link
          href={href}
          className="group inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-gray-900 underline-offset-4 hover:underline dark:text-gray-100"
        >
          {linkLabel ?? "Learn more"}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      )}
    </div>
  );
}
