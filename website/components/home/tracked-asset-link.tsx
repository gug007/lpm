"use client";

import type { ReactNode } from "react";
import { trackDownload } from "@/lib/analytics";

type Props = {
  href: string;
  architecture: string;
  className?: string;
  children: ReactNode;
};

export function TrackedAssetLink({
  href,
  architecture,
  className,
  children,
}: Props) {
  return (
    <a
      href={href}
      onClick={() =>
        trackDownload({
          source: "checksums",
          platform: architecture === "x86_64" ? "mac-intel" : "mac-arm",
          href,
        })
      }
      className={className}
    >
      {children}
    </a>
  );
}
