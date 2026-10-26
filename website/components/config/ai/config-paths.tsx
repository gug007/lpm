import { ArrowDown, FileCode2, Sparkles, type LucideIcon } from "lucide-react";

type Path = {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
  link: string;
  recommended?: boolean;
};

const PATHS: Path[] = [
  {
    href: "#with-ai",
    icon: Sparkles,
    title: "Ask your AI agent",
    body: "Tell Claude Code, Codex, Gemini CLI, or OpenCode what you want in plain words. It writes the change, and lpm checks it before the project updates.",
    link: "See how it works",
    recommended: true,
  },
  {
    href: "#reference",
    icon: FileCode2,
    title: "Edit it yourself",
    body: "Every key with a live preview, copy-ready recipes, and the form and source editors built into the app.",
    link: "Open the reference",
  },
];

export function ConfigPaths() {
  return (
    <div className="mx-auto mb-20 grid max-w-3xl gap-4 sm:mb-24 sm:grid-cols-2">
      {PATHS.map(({ href, icon: Icon, title, body, link, recommended }) => (
        <a
          key={href}
          href={href}
          className={`group flex flex-col rounded-2xl border p-5 transition-colors duration-200 sm:p-6 ${
            recommended
              ? "border-emerald-500/40 bg-emerald-50/40 hover:border-emerald-500/70 dark:border-emerald-400/30 dark:bg-emerald-400/[0.04] dark:hover:border-emerald-400/60"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.02]"
          }`}
        >
          <span className="mb-4 flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {recommended && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                Recommended
              </span>
            )}
          </span>
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </span>
          <span className="mt-1.5 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {body}
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
            {link}
            <ArrowDown
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-y-0.5"
              aria-hidden
            />
          </span>
        </a>
      ))}
    </div>
  );
}
