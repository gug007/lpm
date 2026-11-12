import { COMPARE_LABELS, FOOTER_GROUPS } from "@/lib/footer-links";
import {
  REPO_URL,
  SPONSORS_ENABLED,
  TELEGRAM_URL,
  VS_SLUGS,
  vsPath,
} from "@/lib/links";
import { FooterFollow } from "./footer-follow";
import { FooterGroup } from "./footer-group";
import { FooterRelease } from "./footer-release";
import { FooterSponsor } from "./footer-sponsor";
import { FooterYouTubeCard } from "./footer-youtube-card";
import { TelegramIcon } from "./telegram-icon";

const headingClass =
  "text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400";
const linkClass =
  "inline-flex items-center py-1 text-[13px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";

const COMPARE_LINKS = VS_SLUGS.map((slug) => ({
  href: vsPath(slug),
  label: COMPARE_LABELS[slug],
}));

export function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 py-14">
      <div data-nosnippet className="max-w-5xl mx-auto px-6">
        <FooterRelease />
        <div className="grid sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-4">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading} className="max-sm:contents">
              <FooterGroup
                heading={group.heading}
                links={group.links}
                headingClassName={headingClass}
                linkClassName={linkClass}
                listClassName="space-y-1.5 sm:mt-4"
              />
              {group.withLessons && (
                <div className="max-sm:order-last max-sm:mt-8 sm:mt-10">
                  <h2 className={headingClass}>Watch</h2>
                  <div className="mt-4">
                    <FooterYouTubeCard />
                  </div>
                </div>
              )}
            </div>
          ))}
          <FooterGroup
            heading="Compare lpm with"
            links={COMPARE_LINKS}
            headingClassName={headingClass}
            linkClassName={linkClass}
            listClassName="flex flex-wrap gap-x-5 gap-y-1.5 sm:mt-4"
            className="sm:col-span-full"
          />
        </div>

        {SPONSORS_ENABLED && <FooterSponsor />}

        <FooterFollow />

        <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 ${linkClass}`}
            >
              <TelegramIcon className="w-3.5 h-3.5" />
              Ask questions on Telegram
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              Source on GitHub
            </a>
          </div>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            Free and open source, built for developers.
          </p>
        </div>
      </div>
    </footer>
  );
}
