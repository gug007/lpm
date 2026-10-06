import { ArrowUpRight } from "lucide-react";
import type { DesktopOs } from "@/lib/downloads";
import type { ReleaseVerification } from "@/lib/release-verification";
import { SafetyDisclosure } from "./safety-disclosure";
import { TrackedAssetLink } from "./tracked-asset-link";

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

const VERIFY_COMMANDS: { os: DesktopOs; label: string; command: string }[] = [
  { os: "macos", label: "macOS", command: "shasum -a 256 <file>" },
  {
    os: "windows",
    label: "Windows (PowerShell)",
    command: "Get-FileHash <file> -Algorithm SHA256",
  },
  { os: "linux", label: "Linux", command: "sha256sum <file>" },
];

const CODE = "font-mono text-[11px]";

export function ReleaseChecksums({
  release,
}: {
  release: ReleaseVerification;
}) {
  const publishedAt = formatDate(release.publishedAt);
  const commands = VERIFY_COMMANDS.filter(({ os }) =>
    release.assets.some((asset) => asset.os === os),
  );
  const hasUnsigned = release.assets.some((asset) => asset.os !== "macos");

  return (
    <SafetyDisclosure
      title={`SHA-256 checksums for ${release.tag}`}
      meta={publishedAt ? <span className="hidden sm:inline">{publishedAt}</span> : null}
    >
      <p>
        Compare after downloading.
        {hasUnsigned &&
          " Only the macOS builds are signed, so for the Windows and Linux beta the checksum is the integrity check."}{" "}
        <a
          href={release.releaseUrl}
          className="inline-flex items-center gap-0.5 font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
        >
          View release
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </a>
      </p>
      <ul className="mt-2 grid gap-1">
        {commands.map(({ os, label, command }) => (
          <li key={os}>
            {label}:{" "}
            <code className={CODE}>{command}</code>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-2">
        {release.assets.map((asset) => (
          <div
            key={asset.filename}
            className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-black/20 px-3 py-2"
          >
            <dt className="flex flex-wrap items-baseline justify-between gap-x-4">
              <TrackedAssetLink
                href={asset.downloadUrl}
                platform={asset.platform}
                className="font-semibold text-gray-800 hover:text-black dark:text-gray-200 dark:hover:text-white transition-colors"
              >
                {asset.label} ({asset.architecture})
              </TrackedAssetLink>
              <span className="text-[11px]">{formatSize(asset.size)}</span>
            </dt>
            <dd className="mt-1 break-all font-mono text-[10px]">{asset.sha256}</dd>
          </div>
        ))}
      </dl>
    </SafetyDisclosure>
  );
}
