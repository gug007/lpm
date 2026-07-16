import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";

export default function Hero() {
  return (
    <section className="pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
          The lpm companion for iPhone &amp; iPad
        </p>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Run Claude Code, Codex, or any AI agent from your phone.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed tracking-wide">
          The lpm iOS app pairs with lpm on your Mac and mirrors every terminal
          live. Prompt a running agent with a real composer, review the diff it
          just wrote, commit and push it, and get an encrypted alert the moment
          it&rsquo;s waiting on you. The work stays on your Mac; the control
          comes with you.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          Install lpm on your Mac, then scan one QR code to pair your iPhone or
          iPad.
        </p>

        <div className="mt-8">
          <a
            href={REPO_URL}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          >
            View on GitHub
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
