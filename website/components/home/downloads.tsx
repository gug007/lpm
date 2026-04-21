"use client";

import {
  ArrowRight,
  Laptop,
  Monitor,
  Package,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { trackDownload } from "@/lib/analytics";
import { releaseAsset, RELEASES_URL } from "@/lib/links";
import type { Platform } from "@/lib/use-platform";
import { HighlightPlatform } from "./highlight-platform";
import { SignatureBadge } from "./signature-badge";

type Download = {
  href: string;
  platform: Exclude<Platform, null>;
  product: "desktop" | "cli";
  label: string;
  sub: string;
  icon: LucideIcon;
};

const DOWNLOADS: Download[] = [
  {
    href: releaseAsset("lpm-desktop-macos-arm64.dmg"),
    platform: "mac-arm",
    product: "desktop",
    label: "macOS Desktop",
    sub: "Apple Silicon",
    icon: Laptop,
  },
  {
    href: releaseAsset("lpm-desktop-macos-amd64.dmg"),
    platform: "mac-intel",
    product: "desktop",
    label: "macOS Desktop",
    sub: "Intel",
    icon: Monitor,
  },
  {
    href: releaseAsset("lpm_darwin_arm64.tar.gz"),
    platform: "mac-arm",
    product: "cli",
    label: "CLI",
    sub: "macOS ARM64",
    icon: Terminal,
  },
  {
    href: releaseAsset("lpm_darwin_amd64.tar.gz"),
    platform: "mac-intel",
    product: "cli",
    label: "CLI",
    sub: "macOS Intel",
    icon: Terminal,
  },
];

export function Downloads() {
  return (
    <section
      id="download"
      className="py-20 sm:py-24 border-t border-gray-200 dark:border-gray-800 text-center"
    >
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-col items-center gap-3 mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 tracking-wide uppercase">
            <Package className="w-3 h-3" />
            Latest Release
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Get lpm
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Free and open source. Available for macOS (Apple Silicon &amp;
            Intel).
          </p>
          <SignatureBadge />
        </div>
        <HighlightPlatform />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {DOWNLOADS.map(({ href, platform, product, label, sub, icon: Icon }) => (
            <a
              key={href}
              href={href}
              data-platform={platform}
              onClick={
                product === "desktop"
                  ? () => trackDownload({ source: "downloads", platform })
                  : undefined
              }
              className="dl-card group relative flex flex-col items-center gap-2 px-6 py-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#111]"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center mb-1 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
                <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-gray-400">{sub}</span>
            </a>
          ))}
        </div>
        <div className="mt-8">
          <a
            href={RELEASES_URL}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            View all downloads
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
