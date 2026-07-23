import {
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { getLatestReleaseVerification } from "@/lib/release-verification";
import { PRIVACY_PATH, RELEASES_URL } from "@/lib/links";
import { ReleaseChecksums } from "./release-checksums";

type SafetyItem = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const SAFETY_ITEMS: SafetyItem[] = [
  {
    icon: ShieldCheck,
    title: "Apple verified",
    body: "The app is signed with an Apple-issued Developer ID. The app and DMG include stapled Apple notarization tickets for Gatekeeper.",
  },
  {
    icon: SquareTerminal,
    title: "Expected local access",
    body: "lpm starts and stops local or SSH services and runs terminal commands you configure, using your macOS user permissions.",
  },
  {
    icon: LockKeyhole,
    title: "Local and private",
    body: "No account, desktop telemetry, advertising SDK, or bundled third-party installer. Nothing is sent to servers we control.",
  },
  {
    icon: PackageCheck,
    title: "Native builds",
    body: "Separate Apple Silicon and Intel downloads support macOS 12 or later. No Electron runtime or secondary installer is included.",
  },
];

export async function DownloadSafety() {
  const release = await getLatestReleaseVerification();

  return (
    <div
      id="download-safety"
      className="mt-12 scroll-mt-20 overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-white/[0.025] text-left"
    >
      <div className="px-6 py-7 sm:px-8 sm:py-8">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            Download safety
          </p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            Know exactly what you&rsquo;re installing
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            lpm is open source and distributed directly from its public GitHub
            releases under Developer ID N7S7ZCZ5P7.
          </p>
        </div>
        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          {SAFETY_ITEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-7 text-xs text-gray-500 dark:text-gray-400">
          Read the{" "}
          <a
            href={PRIVACY_PATH}
            className="font-medium underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-white"
          >
            privacy policy
          </a>{" "}
          for the complete data-handling disclosure.
        </p>
      </div>

      {release ? (
        <ReleaseChecksums release={release} />
      ) : (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-black/20 px-6 py-5 text-xs text-gray-500 dark:text-gray-400 sm:px-8">
          Current SHA-256 checksums are published in the{" "}
          <a
            href={RELEASES_URL}
            className="font-medium underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-white"
          >
            latest GitHub release
          </a>
          .
        </div>
      )}

      <div className="flex gap-3 border-t border-gray-200 dark:border-gray-800 px-6 py-6 sm:px-8">
        <Trash2
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
          aria-hidden
        />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Easy to remove
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Quit lpm and move <code className="font-mono">lpm.app</code> from
            Applications to Trash. If you installed the optional CLI link,
            remove <code className="font-mono">/usr/local/bin/lpm</code>.
            Delete <code className="font-mono">~/.lpm</code> only if you also
            want to erase local settings, project configuration, and notes.
          </p>
        </div>
      </div>
    </div>
  );
}
