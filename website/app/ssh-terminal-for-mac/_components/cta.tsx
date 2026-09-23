import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Your local stack and your remote dev box, finally in the same app.
          <br className="hidden sm:block" />{" "}
          Free, native, and ready in minutes.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Install lpm, open the host picker and choose an entry from your{" "}
          <code className="text-sm">~/.ssh/config</code>. lpm forwards
          declared remote service ports as soon as they listen, offers
          one-click forwards for other ports it spots, streams remote services
          into panes, and cleans up the forwards it starts. Supported on every
          Apple Silicon or Intel Mac with macOS 12 and up.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload source="ssh-cta" />
        </div>

        <div className="mt-8">
          <GithubLink
            source="ssh-cta"
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          />
        </div>
      </div>
    </section>
  );
}
