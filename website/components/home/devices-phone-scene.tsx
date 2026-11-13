"use client";

import Link from "next/link";
import { useRef } from "react";
import { AppStoreButton } from "@/components/app-store-button";
import { GooglePlayButton } from "@/components/google-play-button";
import { StoreScan } from "@/components/store-scan";
import { SyncLink } from "@/components/home/paired-devices-link";
import { usePairedDevicesLoop } from "@/components/home/paired-devices-loop";
import { MacReplica } from "@/components/home/paired-devices-mac";
import { MotionToggle } from "@/components/home/paired-devices-pause";
import { PhoneReplica } from "@/components/home/paired-devices-phone";
import { DeviceStatus } from "@/components/home/paired-devices-status";
import { MOBILE_PATH } from "@/lib/links";

type Props = {
  active: boolean;
  paused: boolean;
  onTogglePause: () => void;
  summary: string;
  // The home page follows the mirror with the store buttons, which the phone
  // page has elsewhere.
  appStore: boolean;
};

export function PhoneScene({
  active,
  paused,
  onTogglePause,
  summary,
  appStore,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const {
    reduced,
    visible,
    typed,
    isTyping,
    working,
    owner,
    phoneOpen,
    notified,
    tap,
  } = usePairedDevicesLoop(ref, paused || !active);
  const status = <DeviceStatus working={working} />;

  return (
    <div ref={ref}>
      <p className="sr-only">{summary}</p>

      {/* On a phone the iPhone overlaps the Mac's corner instead of
          stacking under it, so both devices fit on one screen. */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="relative block h-[27.5rem] sm:flex sm:h-auto sm:flex-row sm:items-center sm:justify-center"
        >
          <div className="pointer-events-none absolute -inset-x-8 -inset-y-10 bg-grid" />
          <MacReplica
            className="max-sm:w-[86%]"
            controlled={owner === "mac"}
            taking={tap === "mac"}
            visible={visible}
            status={status}
            working={working}
          />
          <SyncLink animate={!reduced && !paused} />
          <PhoneReplica
            className="max-sm:absolute max-sm:right-0 max-sm:top-24 max-sm:origin-top-right max-sm:scale-[0.68]"
            open={phoneOpen}
            controlled={owner === "phone"}
            notified={notified}
            pressed={tap === "notification"}
            visible={visible}
            status={status}
            typed={typed}
            isTyping={isTyping}
          />
        </div>
        {!reduced && (
          <MotionToggle
            paused={paused}
            onToggle={onTogglePause}
            className="absolute bottom-0 left-0 sm:left-auto sm:right-0 sm:-bottom-14 lg:bottom-0"
          />
        )}
      </div>

      {appStore && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center sm:mt-14">
          <div className="flex flex-col items-center gap-4 md:flex-row">
            <AppStoreButton source="home-devices" />
            <GooglePlayButton source="home-devices" />
            <StoreScan />
          </div>
          <p className="text-pretty text-[13px] text-gray-500 dark:text-gray-400">
            lpm link for iPhone, iPad and Android. Scan one QR code to pair it with your
            computer.{" "}
            <Link
              href={MOBILE_PATH}
              className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white"
            >
              See the iPhone app
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
