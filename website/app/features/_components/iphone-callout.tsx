import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import { AppStoreButton } from "@/components/app-store-button";
import { MOBILE_PATH } from "@/lib/links";

export default function IphoneCallout() {
  return (
    <div className="mb-10 flex flex-col items-center gap-6 rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm shadow-gray-900/[0.03] sm:p-8 md:flex-row md:text-left dark:border-gray-800 dark:bg-white/[0.03] dark:shadow-none">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-800 ring-1 ring-gray-200/80 dark:bg-white/[0.06] dark:text-gray-200 dark:ring-white/[0.08]">
        <Smartphone className="h-6 w-6" aria-hidden />
      </span>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          lpm link is free on the App Store
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          In lpm on your Mac, open Settings → Mobile devices, choose Add a
          device, then scan the QR code with your iPhone or iPad.
        </p>
        <Link
          href={MOBILE_PATH}
          className="group mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-gray-900 underline-offset-4 hover:underline dark:text-gray-100"
        >
          Tour the iPhone app
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
      <AppStoreButton source="features" />
    </div>
  );
}
