import {
  Bot,
  GitPullRequest,
  Globe,
  Server,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { BetaTag } from "@/components/home/beta-tag";
import { OsIcon } from "@/components/home/os-icon";
import { SectionHeader } from "@/components/section-header";
import type { DesktopOs } from "@/lib/downloads";
import { REQUIREMENTS_AREA } from "./areas";

type Requirement = {
  icon: LucideIcon | DesktopOs;
  title: string;
  body: string;
  beta?: boolean;
};

const ICON = "h-4 w-4 text-gray-500 dark:text-gray-400";

const REQUIREMENTS: Requirement[] = [
  {
    icon: "macos",
    title: "macOS",
    body: "macOS 12 or later; pick the Apple Silicon or the Intel download.",
  },
  {
    icon: "windows",
    title: "Windows",
    body: "Windows 11 on an x64 PC; there is no ARM64 build. Install Git for Windows first: terminals, services, and agents run in its Git Bash.",
    beta: true,
  },
  {
    icon: "linux",
    title: "Linux",
    body: "A 64-bit x86 (amd64) desktop with glibc 2.35 or newer, such as Ubuntu 22.04 and up; there is no ARM build. Choose the .deb, .rpm, or AppImage; with the AppImage, install Git, SSH, and a clipboard tool (wl-clipboard or xclip) yourself.",
    beta: true,
  },
  {
    icon: Bot,
    title: "AI coding agents",
    body: "Claude Code, Codex, Gemini CLI, or OpenCode, installed and signed in by you. lpm doesn't bundle them, and they run under your own accounts.",
  },
  {
    icon: GitPullRequest,
    title: "Git and GitHub",
    body: "Git for review and commits. Pull request features also need the GitHub CLI (gh), signed in.",
  },
  {
    icon: Smartphone,
    title: "iPhone or iPad",
    body: "The free lpm link app, paired with a computer or Linux host that is awake and running lpm.",
  },
  {
    icon: Server,
    title: "Linux host",
    body: "An x86_64 server on Ubuntu 22.04 or newer, reachable over key-based SSH as root or a user with passwordless sudo.",
  },
  {
    icon: Globe,
    title: "Away from home",
    body: "Tailscale on both devices, or another network route you set up. lpm has no cloud relay for terminals.",
  },
];

export default function Requirements() {
  const Icon = REQUIREMENTS_AREA.icon;
  return (
    <section
      id={REQUIREMENTS_AREA.id}
      className="scroll-mt-10 border-t border-gray-200 py-16 sm:py-20 dark:border-gray-800"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          className="mb-10"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {REQUIREMENTS_AREA.eyebrow}
            </span>
          }
          title="What you need"
          description="A computer on one of the three systems below. Everything else depends on which features you use."
        />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REQUIREMENTS.map(({ icon: ItemIcon, title, body, beta }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <dt className="flex items-center gap-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {typeof ItemIcon === "string" ? (
                  <OsIcon os={ItemIcon} className={ICON} />
                ) : (
                  <ItemIcon className={ICON} aria-hidden />
                )}
                {title}
                {beta && (
                  <BetaTag className="border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400" />
                )}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
