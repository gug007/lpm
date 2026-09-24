import { HeroDownload } from "@/components/home/hero-download";

export default function MidCta() {
  return (
    <section className="pt-6 pb-14 sm:pt-8 sm:pb-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex flex-col items-center gap-6 border-t border-gray-200 pt-8 text-center lg:flex-row lg:justify-between lg:gap-10 lg:pt-10 lg:text-left dark:border-gray-800">
          <div className="max-w-xl">
            <h2 className="text-balance text-2xl font-bold tracking-tight text-gray-900 sm:text-[1.75rem] dark:text-white">
              Try it on a project you already have
            </h2>
            <p className="mt-2 text-balance text-sm leading-relaxed text-gray-500 sm:text-base dark:text-gray-400">
              Add a folder you&apos;re already working in, right-click it and
              choose Duplicate. Free, open source, no account.
            </p>
          </div>
          <div className="shrink-0 lg:[&>div]:min-h-0">
            <HeroDownload source="worktree-alt-mid" />
          </div>
        </div>
      </div>
    </section>
  );
}
