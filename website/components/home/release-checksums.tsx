import { ArrowUpRight } from "lucide-react";
import type { ReleaseVerification } from "@/lib/release-verification";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function ReleaseChecksums({
  release,
}: {
  release: ReleaseVerification;
}) {
  const publishedAt = formatDate(release.publishedAt);

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-black/20 px-6 py-6 sm:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            SHA-256 checksums for {release.tag}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Compare after downloading with{" "}
            <code className="font-mono text-[11px]">
              shasum -a 256 &lt;file&gt;
            </code>
            {publishedAt ? ` · Published ${publishedAt}` : ""}
          </p>
        </div>
        <a
          href={release.releaseUrl}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          View release
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
      <div className="mt-4 grid gap-3">
        {release.assets.map((asset) => (
          <div
            key={asset.filename}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-white/[0.03] px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <a
                href={asset.downloadUrl}
                className="text-xs font-semibold text-gray-800 hover:text-black dark:text-gray-200 dark:hover:text-white transition-colors"
              >
                {asset.label} ({asset.architecture})
              </a>
              <span className="text-[11px] text-gray-400">
                {formatSize(asset.size)}
              </span>
            </div>
            <code className="mt-2 block break-all font-mono text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
              {asset.sha256}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
