import {
  FlaskConical,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type Status = {
  icon: LucideIcon;
  text: string;
  chip: string;
  beta?: boolean;
};

const STATUSES: Status[] = [
  {
    icon: ShieldCheck,
    text: "Mac builds are signed with Apple Developer ID N7S7ZCZ5P7 and notarized by Apple",
    chip: "Signed",
  },
  {
    icon: PackageCheck,
    text: "Every build has a SHA-256 checksum on its GitHub release",
    chip: "All builds",
  },
  {
    icon: LockKeyhole,
    text: "The desktop app, the CLI and lpm Link send no analytics, and no crash reports unless you turn them on",
    chip: "Off by default",
  },
  {
    icon: LockKeyhole,
    text: "iPhone push alerts are sealed on your computer before they reach the relay",
    chip: "Sealed",
  },
  {
    icon: FlaskConical,
    text: "Windows and Linux builds are a beta and aren't code-signed yet",
    chip: "Beta",
    beta: true,
  },
];

export function SecurityStatus() {
  return (
    <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
      {STATUSES.map(({ icon: Icon, text, chip, beta }) => (
        <li key={text} className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:px-5">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${
              beta
                ? "text-gray-400 dark:text-gray-500"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {text}
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-medium ${
              beta
                ? "border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
                : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
            }`}
          >
            {chip}
          </span>
        </li>
      ))}
    </ul>
  );
}
