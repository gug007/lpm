import Link from "next/link";
import { Check, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRelease } from "@/components/release-context";
import type { DesktopOs } from "@/lib/downloads";
import { REPO_URL, SECURITY_PATH } from "@/lib/links";
import { DotRow } from "./dot-row";
import { ReleaseFreshness } from "./release-freshness";

const ITEM =
  "inline-flex min-h-6 items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";
const ICON = "h-3.5 w-3.5 shrink-0";

// What people check before installing, on one readable line. The build being
// offered decides the signing claim: only the Mac builds are signed.
export function HeroTrustLine({ os }: { os: DesktopOs | null }) {
  const { release, downloads } = useRelease();
  const updatedAt = release?.publishedAt;
  return (
    <p className="text-[13px] text-gray-500 dark:text-gray-400">
      <DotRow
        stackOnMobile
        items={[
          updatedAt && (
            <ReleaseFreshness
              key="updated"
              publishedAt={updatedAt}
              className={ITEM}
            />
          ),
          <a key="license" href={REPO_URL} className={ITEM}>
            <Check className={ICON} strokeWidth={2.5} aria-hidden />
            Free and MIT-licensed
          </a>,
          os && (
            <Link
              key="signing"
              href={SECURITY_PATH}
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
