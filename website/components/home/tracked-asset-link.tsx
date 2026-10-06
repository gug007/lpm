"use client";

import type { ReactNode } from "react";
import { trackDownload, type DownloadPlatform } from "@/lib/analytics";

type Props = {
  href: string;
  platform: DownloadPlatform;
  className?: string;
  children: ReactNode;
};

export function TrackedAssetLink({
  href,
  platform,
  className,
  children,
}: Props) {
  return (
    <a
      href={href}
      onClick={() => trackDownload({ source: "checksums", platform, href })}
      className={className}
    >
      {children}
    </a>
  );
}
