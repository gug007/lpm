import Link from "next/link";
import { Check, ShieldAlert, ShieldCheck } from "lucide-react";
import type { DesktopOs } from "@/lib/downloads";
import { REPO_URL } from "@/lib/links";
import { DotRow } from "./dot-row";

const ITEM =
  "inline-flex min-h-6 items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";
const ICON = "h-3.5 w-3.5 shrink-0";

type Props = {
  os: DesktopOs | null;
  downloads: string | null;
};

// What people check before installing, on one readable line. The build being
// offered decides the signing claim: only the Mac builds are signed.
export function HeroTrustLine({ os, downloads }: Props) {
  return (
    <p className="text-[13px] text-gray-500 dark:text-gray-400">
      <DotRow
        stackOnMobile
        items={[
          <a key="license" href={REPO_URL} className={ITEM}>
            <Check className={ICON} strokeWidth={2.5} aria-hidden />
            Free and MIT-licensed
          </a>,
          os && (
            <Link
              key="signing"
              href="/#download-safety"
              prefetch={false}
              className={ITEM}
            >
              {os === "macos" ? (
                <>
                  <ShieldCheck className={ICON} aria-hidden />
                  Signed and notarized by Apple
                </>
              ) : (
                <>
                  <ShieldAlert className={ICON} aria-hidden />
                  Beta, not code-signed yet
                </>
              )}
            </Link>
          ),
          downloads && <span key="downloads">{downloads} downloads</span>,
        ]}
      />
    </p>
  );
}
