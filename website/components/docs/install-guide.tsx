import Link from "next/link";
import { Section } from "@/components/config/section";
import { HeroDownload } from "@/components/home/hero-download";
import { InstallStepsList } from "@/components/install-steps-list";
import { CODE, LINK, P } from "@/components/prose";
import { RemoveLpm } from "@/components/remove-lpm";
import { docsPath } from "@/lib/docs-pages";
import {
  DOWNLOAD_ENTRIES,
  GIT_FOR_WINDOWS_URL,
  OS_REQUIREMENTS,
} from "@/lib/downloads";
import { installSteps } from "@/lib/install-steps";
import {
  DISCUSSIONS_URL,
  REPO_URL,
  SECURITY_PATH,
  TELEGRAM_URL,
} from "@/lib/links";
import { DocsHeading } from "./docs-heading";
import { InstallProblem } from "./install-problem";

export function InstallGuide() {
  return (
    <Section
      title="Install lpm"
      description="lpm is a desktop app for macOS, Windows and Linux. Download the build for your computer, install it, and open your first project."
    >
      <div className="rounded-2xl border border-gray-200 bg-gray-50/60 px-4 py-8 dark:border-gray-800 dark:bg-white/[0.02]">
        <HeroDownload source="docs-install" />
      </div>

      <DocsHeading id="macos">macOS</DocsHeading>
      <p className={`mb-4 ${P}`}>
        macOS {OS_REQUIREMENTS.macos}, on Apple Silicon or Intel. The builds are
        signed and notarized by Apple. On an Intel Mac the file is{" "}
        <code className={CODE}>{DOWNLOAD_ENTRIES["mac-intel"].filename}</code>.
      </p>
      <InstallStepsList steps={installSteps(DOWNLOAD_ENTRIES["mac-arm"])} />

      <DocsHeading id="windows">Windows</DocsHeading>
      <p className={`mb-4 ${P}`}>
        Windows {OS_REQUIREMENTS.windows}. The Windows build is a beta and
        isn&rsquo;t code-signed yet.
      </p>
      <InstallStepsList steps={installSteps(DOWNLOAD_ENTRIES["windows-x64"])} />

      <DocsHeading id="linux">Linux</DocsHeading>
      <p className={P}>
        64-bit x86, Ubuntu 22.04 or newer (glibc 2.35 or newer). The Linux
        builds are a beta and aren&rsquo;t code-signed yet. Pick one of
        three:
      </p>
      <DocsHeading id="linux-deb" level={3}>
        Debian and Ubuntu (.deb)
      </DocsHeading>
      <InstallStepsList steps={installSteps(DOWNLOAD_ENTRIES["linux-deb"])} />
      <DocsHeading id="linux-rpm" level={3}>
        Fedora and other rpm systems (.rpm)
      </DocsHeading>
      <InstallStepsList steps={installSteps(DOWNLOAD_ENTRIES["linux-rpm"])} />
      <DocsHeading id="linux-appimage" level={3}>
        Any distribution (AppImage)
      </DocsHeading>
      <InstallStepsList
        steps={installSteps(DOWNLOAD_ENTRIES["linux-appimage"])}
      />

      <DocsHeading id="first-project">Your first project</DocsHeading>
      <p className={P}>
        Click <strong className="font-semibold">+</strong> in the sidebar and
        pick a folder, or paste a Git URL to clone one. lpm reads
        the project&rsquo;s own files and writes a service for each dev server
        it finds (see{" "}
        <Link href={docsPath("detection")} className={LINK}>
          service detection
        </Link>
        ). Press Start to run them all, then open Claude Code or Codex from
        the project toolbar. To let your agent change the setup for you,{" "}
        <Link href={docsPath("ask-your-agent")} className={LINK}>
          install the lpm skills and CLI
        </Link>
        .
      </p>

      <DocsHeading id="updates">Updates</DocsHeading>
      <p className={P}>
        lpm checks GitHub for a new version at launch and every 24 hours, and
        offers it in the sidebar. On a Mac, Update installs it and restarts
        lpm, or waits until your agents finish. On Windows and Linux,
        Download opens the release, and you install it the way you installed
        lpm. Settings &rarr; Updates switches between the Stable and Beta
        channels.
      </p>

      <DocsHeading id="verify">Check what you downloaded</DocsHeading>
      <p className={P}>
        Every build has a SHA-256 checksum, and the Mac builds can be checked
        against Apple&rsquo;s notarization.{" "}
        <Link href={SECURITY_PATH} className={LINK}>
          Security
        </Link>{" "}
        has the commands, the checksums for the latest release, and what lpm
        sends over the network.
      </p>

      <DocsHeading id="troubleshooting">If it won&rsquo;t install or open</DocsHeading>
      <ul className="space-y-2">
        <InstallProblem title="“lpm” is not supported on this Mac">
          The build doesn&rsquo;t match your Mac&rsquo;s chip. Apple menu
          &rarr; About This Mac shows the chip: Apple M-series needs the Apple
          Silicon build, Intel needs the Intel one.
        </InstallProblem>
        <InstallProblem title="Windows protected your PC">
          SmartScreen warns about apps that aren&rsquo;t code-signed. Choose
          More info, then Run anyway.
        </InstallProblem>
        <InstallProblem title="Commands fail on Windows">
          lpm runs commands through Git Bash.{" "}
          <a
            href={GIT_FOR_WINDOWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Install Git for Windows
          </a>
          , then restart lpm.
        </InstallProblem>
        <InstallProblem title="The Linux package won’t install or start">
          The builds need glibc 2.35 or newer (Ubuntu 22.04 or later) on
          64-bit x86. There&rsquo;s no ARM build yet.
        </InstallProblem>
        <InstallProblem title="Something else">
          Ask in{" "}
          <a href={DISCUSSIONS_URL} className={LINK}>
            GitHub Discussions
          </a>{" "}
          or on{" "}
          <a href={TELEGRAM_URL} className={LINK}>
            Telegram
          </a>
          , or{" "}
          <a href={`${REPO_URL}/issues/new`} className={LINK}>
            open an issue
          </a>{" "}
          with your OS version and what you see.
        </InstallProblem>
      </ul>

      <DocsHeading id="remove">Remove lpm</DocsHeading>
      <div className={P}>
        <RemoveLpm />
      </div>
    </Section>
  );
}
