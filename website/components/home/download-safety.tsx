import {
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { getLatestReleaseVerification } from "@/lib/release-verification";
import { PRIVACY_PATH, RELEASES_URL } from "@/lib/links";
import { ReleaseChecksums } from "./release-checksums";
import { SafetyDisclosure } from "./safety-disclosure";

const LINK =
  "font-medium underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-white";
const CODE = "font-mono";

type SafetyItem = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const SAFETY_ITEMS: SafetyItem[] = [
  {
    icon: ShieldCheck,
    title: "Notarized",
    body: "Signed with an Apple Developer ID and notarized, so Gatekeeper opens it.",
  },
  {
    icon: LockKeyhole,
    title: "Private",
    body: (
      <>
        No account or telemetry. Besides GitHub update checks, only optional
        iPhone push reaches an lpm server.{" "}
        <a href={PRIVACY_PATH} className={LINK}>
          Privacy
        </a>
      </>
    ),
  },
  {
    icon: SquareTerminal,
    title: "Your commands only",
    body: "Runs what you configure as your user and adds Claude Code and Codex status hooks.",
  },
  {
    icon: PackageCheck,
    title: "Native builds",
    body: "Apple Silicon and Intel, macOS 12 or later. No Electron, no extra installer.",
  },
];

export async function DownloadSafety() {
  const release = await getLatestReleaseVerification();

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
          Open source, shipped from public GitHub releases under Developer ID
          N7S7ZCZ5P7.
        </p>
        <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {SAFETY_ITEMS.map(({ icon: Icon, title, body }) => (
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
        Choose Remove app in lpm&apos;s settings: it stops your projects and
        removes the app, the <code className={CODE}>lpm</code>{" "}command, its
        agent skills, its Claude Code and Codex hooks and its Claude Code status
        line, and can also erase settings, project config and notes. By hand:
        quit lpm, trash <code className={CODE}>lpm.app</code>, delete{" "}
        <code className={CODE}>/usr/local/bin/lpm</code>{" "}and{" "}
        <code className={CODE}>~/.lpm</code>, then remove the lpm hooks in{" "}
        <code className={CODE}>~/.claude</code>{" "}and{" "}
        <code className={CODE}>~/.codex</code>{" "}and the lpm skills in{" "}
        <code className={CODE}>~/.claude/skills</code>{" "}and{" "}
        <code className={CODE}>~/.agents/skills</code>.
      </SafetyDisclosure>
    </div>
  );
}
