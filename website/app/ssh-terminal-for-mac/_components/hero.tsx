import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_28%)]" />
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-teal-700/70 dark:text-teal-300/70 mb-5">
          SSH terminal for Mac developers
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          A Mac SSH client and terminal that makes remote dev boxes feel local.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          lpm is a native SSH terminal for Mac that imports your{" "}
          <code className="text-xs">~/.ssh/config</code>, forwards remote ports
          to <code className="text-xs">localhost</code>, and keeps remote
          services in panes beside your local stack. No separate SSH client, no
          hand-typed <code className="text-xs">ssh -L</code>, no orphan
          tunnels.
        </p>

        <div className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap justify-center gap-3 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            ~/.ssh/config host picker
          </span>
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            remote port forwarding
          </span>
          <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 shadow-sm dark:border-gray-800 dark:bg-white/[0.04]">
            ProxyJump ready
          </span>
        </div>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="ssh-hero" />
        </div>

        <div className="mt-[clamp(1rem,2vh,1.5rem)]">
          <GithubLink
            source="ssh-hero"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          />
        </div>
      </div>
    </section>
  );
}
