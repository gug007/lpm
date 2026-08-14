import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

const POINTS = [
  {
    label: "One field",
    body: "Type what you'd type after ssh. lpm installs itself on the server and pairs over that same connection.",
  },
  {
    label: "Nothing new exposed",
    body: "The server keeps listening only to itself. lpm reaches it through an SSH tunnel it brings up and keeps alive.",
  },
  {
    label: "A box you own",
    body: "A €5 VPS or the desktop under your desk. It keeps your dependencies, your caches, and your half-finished branch.",
  },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.11),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_30%)]" />
      <div className="max-w-4xl mx-auto px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-violet-700/70 dark:text-violet-300/70 mb-5">
          Linux hosts, from the Mac app
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Run Claude Code and Codex on a Linux server, from your Mac.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          A long agent run and a laptop lid are a bad match. Add a Linux server
          to lpm by typing{" "}
          <code className="font-mono text-[0.9em]">user@build-server</code>
          {" — "}it installs and pairs itself over SSH, and that server&rsquo;s
          projects, terminals, services, and agents appear in your sidebar next
          to the local ones. Then close the lid. They keep going.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="linux-host-hero" />
        </div>

        <a
          href="#lifetimes"
          className="mt-[clamp(1rem,2vh,1.5rem)] inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          See exactly what keeps running
          <ArrowDown className="w-3.5 h-3.5" aria-hidden />
        </a>

        <div className="mt-[clamp(1.5rem,4vh,2.25rem)] grid gap-4 md:grid-cols-3 text-left">
          {POINTS.map(({ label, body }) => (
            <article
              key={label}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {label}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
