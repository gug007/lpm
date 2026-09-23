import {
  AppWindow,
  Cpu,
  FolderKanban,
  FolderTree,
  GitBranch,
  Globe,
  LayoutGrid,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { GIT_TERMINAL_MAC_PATH, PROJECT_SIDEBAR_PATH } from "@/lib/links";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

const FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: "Native Apple silicon and Intel builds",
    body: (
      <>
        Ships separate native builds for Apple silicon and Intel Macs. No
        Rosetta on Apple silicon, no Electron, and no bundled Chromium runtime
        — the app uses the webview already provided by macOS.
      </>
    ),
  },
  {
    icon: LayoutGrid,
    title: "Every service in one window",
    body: (
      <>
        Watch your API, worker, database, and Next.js frontend stream live
        logs side by side in one native window. No more ten iTerm2 tabs
        guessing which one crashed.
      </>
    ),
  },
  {
    icon: FolderKanban,
    title: "Visual project switcher",
    body: (
      <>
        Every project sits in a{" "}
        <Link href={PROJECT_SIDEBAR_PATH} className={LINK}>
          sidebar with live state
        </Link>
        . Click one, press ⌘1–⌘9, or hold Ctrl and tap Tab for the ones you
        used last. No more <code className="text-xs">cd ~/code/long/path</code>
        {", "}no more &ldquo;which Terminal.app window was that?&rdquo;.
      </>
    ),
  },
  {
    icon: Zap,
    title: "One-click full-stack start",
    body: (
      <>
        One click starts the whole stack. lpm sets it up from the files already
        in your repo, whether Rails, Next.js, Django, Go, Laravel or Docker
        Compose, and the config editor can have AI refine it.
      </>
    ),
  },
  {
    icon: FolderTree,
    title: "A Files tab in the same pane",
    body: (
      <>
        ⌘⇧E opens a folder tree beside your shells, ⌘P jumps to any file by
        name, and the editor saves with ⌘S. Markdown renders the way GitHub
        shows it, and images preview inline.
      </>
    ),
  },
  {
    icon: Globe,
    title: "A browser tab next to your shells",
    body: (
      <>
        Open a web page as a tab beside your terminals, with an address bar,
        back, forward, and reload. A quick look at localhost without switching
        windows; your real browser is still one click away.
      </>
    ),
  },
  {
    icon: GitBranch,
    title: "Great git terminal on macOS",
    body: (
      <>
        Run every git command in your own shell, or use the branch switcher in
        the footer, commit with an AI-drafted message, and open a pull request
        from the same window. More on lpm as a{" "}
        <Link href={GIT_TERMINAL_MAC_PATH} className={LINK}>
          git terminal for Mac
        </Link>
        .
      </>
    ),
  },
  {
    icon: AppWindow,
    title: "Plays well with your other apps",
    body: (
      <>
        Open any project in Cursor, VS Code, Zed, Xcode, WebStorm, iTerm,
        Ghostty, Warp, or Finder with one click; only the apps you have are
        listed. Pick a light or dark theme, or let it follow macOS.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Inside the app"
          title="A Mac-native terminal workspace, not another tab strip"
          description="What you get beyond a single shell window."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
