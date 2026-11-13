import Link from "next/link";
import {
  FlaskConical,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { STATUS_AGENT_NAMES } from "@/lib/app-facts";
import { getLatestReleaseVerification } from "@/lib/release-verification";
import { PRIVACY_PATH, RELEASES_URL, SECURITY_PATH } from "@/lib/links";
import { RemoveLpm } from "@/components/remove-lpm";
import { ReleaseChecksums } from "./release-checksums";
import { SafetyDisclosure } from "./safety-disclosure";

const LINK =
  "font-medium underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-white";

type SafetyItem = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

// The Windows and Linux files are attached after the DMGs, so the checksum
// list below can hold only the Mac builds for a while after a release.
function betaItem(checksumsBelow: boolean): SafetyItem {
  return {
    icon: FlaskConical,
    title: "Windows and Linux beta",
    body: checksumsBelow
      ? "Not code-signed yet, so compare the SHA-256 checksums below. The Windows installer needs no admin rights."
      : "Not code-signed yet, so compare the SHA-256 checksum on the GitHub release page. The Windows installer needs no admin rights.",
  };
}

const NOTARIZED_ITEM: SafetyItem = {
  icon: ShieldCheck,
  title: "Notarized on macOS",
  body: "The Mac builds are signed with an Apple Developer ID and notarized, so Gatekeeper opens them.",
};

const OTHER_ITEMS: SafetyItem[] = [
  {
    icon: LockKeyhole,
    title: "Private",
    body: (
      <>
        No account or analytics, and crash reports can be turned off in
        Settings. Besides GitHub update checks, only optional iPhone push
        reaches an lpm server.{" "}
        <a href={PRIVACY_PATH} className={LINK}>
          Privacy
        </a>
      </>
    ),
  },
  {
    icon: SquareTerminal,
    title: "Your commands only",
    body: `Runs what you configure as your user and adds status hooks for ${STATUS_AGENT_NAMES}.`,
  },
  {
    icon: PackageCheck,
    title: "Native builds",
    body: "macOS 12 or later on Apple Silicon or Intel, Windows 11 x64, and 64-bit x86 Linux. No Electron.",
  },
];

export async function DownloadSafety() {
  const release = await getLatestReleaseVerification();
  const checksumsBelow =
    release?.assets.some(({ os }) => os !== "macos") ?? false;
  const items = [NOTARIZED_ITEM, betaItem(checksumsBelow), ...OTHER_ITEMS];

  return (
    <div
      id="download-safety"
      className="mt-12 scroll-mt-20 overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-white/[0.025] text-left"
    >
      <div className="px-6 py-6 sm:px-8">
        <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">
          Know exactly what you&rsquo;re installing
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Open source, shipped from public GitHub releases. The Mac builds are
          signed under Developer ID N7S7ZCZ5P7.{" "}
          <Link href={SECURITY_PATH} className={LINK}>
            Security details
          </Link>
        </p>
        <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-2.5">
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {title}.
                </span>{" "}
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {release ? (
        <ReleaseChecksums release={release} />
      ) : (
        <p className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 text-xs text-gray-500 dark:text-gray-400 sm:px-8">
          SHA-256 checksums are published in the{" "}
          <a href={RELEASES_URL} className={LINK}>
            latest GitHub release
          </a>
          .
        </p>
      )}

      <SafetyDisclosure title="How to remove lpm">
        <RemoveLpm />
      </SafetyDisclosure>
    </div>
  );
}
