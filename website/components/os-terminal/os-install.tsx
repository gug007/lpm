import { ArrowDown } from "lucide-react";
import { DownloadLink } from "@/components/home/download-link";
import { InstallStepsList } from "@/components/install-steps-list";
import { SectionHeader } from "@/components/section-header";
import { DOWNLOADS_BY_OS, type DesktopOs } from "@/lib/downloads";
import { installSteps } from "@/lib/install-steps";

type Props = {
  os: DesktopOs;
  title: string;
  description: string;
};

export function OsInstall({ os, title, description }: Props) {
  const entries = DOWNLOADS_BY_OS[os];
  return (
    <section
      id="install"
      className="scroll-mt-20 border-y border-gray-200 bg-gray-50/60 py-20 sm:py-24 dark:border-gray-800/60 dark:bg-white/[0.015]"
    >
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader eyebrow="Install" title={title} description={description} />
        <div className="mx-auto grid max-w-2xl gap-4">
          {entries.map((entry) => (
            <div
              key={entry.platform}
              className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#111]"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {entry.choiceLabel}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
                    {entry.choiceDescription}
                  </p>
                </div>
                <DownloadLink
                  entry={entry}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 px-3.5 py-1.5 text-[13px] font-medium text-gray-800 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  Download
                </DownloadLink>
              </div>
              <InstallStepsList steps={installSteps(entry)} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
