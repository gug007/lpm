import { ArrowRight } from "lucide-react";
import { DownloadLink } from "@/components/download-link";
import AppStoreButton from "./app-store-button";

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 mb-5">
          The lpm companion for iPhone &amp; iPad
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Control Claude Code and Codex on your Mac from your iPhone.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          The lpm iOS app pairs with lpm on your Mac and mirrors every terminal
          live. Prompt Claude Code, Codex, or any running agent with a real
          composer, review the diff it
          just wrote, commit and push it, and get an encrypted alert the moment
          it&rsquo;s waiting on you. The work stays on your Mac; the control
          comes with you.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <AppStoreButton source="mobile-hero" />
        </div>
        <DownloadLink className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          Get lpm for your Mac
          <ArrowRight className="w-3.5 h-3.5" />
        </DownloadLink>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Install lpm on your Mac and the lpm link app on your iPhone or iPad,
          then scan one QR code to pair.
        </p>
      </div>
    </section>
  );
}
