import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-balance text-3xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl dark:text-white">
          Stop hunting for what&rsquo;s on port 3000.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg dark:text-gray-400">
          Add your project to lpm and press Start: it checks every port first
          and frees a busy one in a click. Free and open source.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source="port-cta" />
        </div>
        <div className="mt-8">
          <GithubLink
            source="port-cta"
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          />
        </div>
      </div>
    </section>
  );
}
