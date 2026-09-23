"use client";

import { useRef, useState } from "react";
import { AppStoreButton } from "@/components/app-store-button";
import { DevicesCapabilities } from "@/components/home/devices-capabilities";
import { DevicesCards } from "@/components/home/devices-cards";
import { SyncLink } from "@/components/home/paired-devices-link";
import { usePairedDevicesLoop } from "@/components/home/paired-devices-loop";
import { MacReplica } from "@/components/home/paired-devices-mac";
import { MotionToggle } from "@/components/home/paired-devices-pause";
import { PhoneReplica } from "@/components/home/paired-devices-phone";
import { DeviceStatus } from "@/components/home/paired-devices-status";
import { SectionHeader } from "@/components/section-header";

type Props = {
  // false on the iPhone page itself, which keeps only the mirror, drops
  // everything that would point back at that page, and tells the handoff in
  // its own words so the two pages don't share a block of copy.
  companionLink?: boolean;
  flush?: boolean;
};

const COPY = {
  home: {
    eyebrow: "Across devices",
    title: "The same terminal, on your Mac and in your pocket",
    description:
      "When Claude Code or Codex needs you, your iPhone gets a notification. Answer from the phone, then take control back at your desk — one session, running on your Mac the whole time.",
    summary:
      "An illustration of one Claude Code session on a Mac and an iPhone. The agent tightens a login rate limiter in lpm on the Mac, then stops to ask before committing, and the locked iPhone gets a notification. Opening it brings up the same terminal on the phone, which takes control, so the Mac shows “Active in iPhone” with a Take control button. From the phone you answer “yes — commit & open the PR” and the agent carries on. Then the Mac takes control back and the phone shows the terminal is active there.",
  },
  mobile: {
    eyebrow: "Desktop + iPhone",
    title: "Watch one session change hands",
    description:
      "A Claude Code turn stops for approval on the Mac, the push lands on your iPhone, and you answer there. The Mac then takes the terminal back; the session itself never leaves the Mac.",
    summary:
      "An animation of one Claude Code session handed between a Mac and an iPhone. The agent pauses before it commits, and a push reaches the locked phone. Tapping it moves the terminal to the phone, so the Mac tab reads “Active in iPhone” and offers Take control. The reply goes in from the phone, the agent keeps working, and then the Mac takes the terminal back.",
  },
};

export function PairedDevices({ companionLink = true, flush = false }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
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
  } = usePairedDevicesLoop(sectionRef, paused);

  const status = <DeviceStatus working={working} />;
  const copy = companionLink ? COPY.home : COPY.mobile;

  return (
    <section
      ref={sectionRef}
      data-pd-paused={paused || undefined}
      className={`${flush ? "pb-16 sm:pb-20" : "py-16 sm:py-20"} overflow-x-clip`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className="mb-12"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="relative inline-flex h-1.5 w-1.5"
                aria-hidden="true"
              >
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              {copy.eyebrow}
            </span>
          }
          title={copy.title}
          description={copy.description}
        />

        <p className="sr-only">{copy.summary}</p>

        <div className="relative">
          <div
            aria-hidden="true"
            className="relative flex flex-col items-center justify-center sm:flex-row"
          >
            <div className="pointer-events-none absolute -inset-x-8 -inset-y-10 bg-grid" />
            <MacReplica
              controlled={owner === "mac"}
              taking={tap === "mac"}
              visible={visible}
              status={status}
              working={working}
            />
            <SyncLink animate={!reduced && !paused} />
            <PhoneReplica
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
              onToggle={() => setPaused((p) => !p)}
              className="absolute bottom-0 right-0 sm:-bottom-14 lg:bottom-0"
            />
          )}
        </div>

        {companionLink && (
          <>
            <div className="mt-12 flex flex-col items-center gap-3 text-center sm:mt-14">
              <AppStoreButton source="home-devices" />
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                lpm link for iPhone and iPad. Scan one QR code to pair it with
                your Mac.
              </p>
            </div>
            <div className="mt-10 border-t border-gray-200 pt-10 sm:mt-14 sm:pt-12 dark:border-gray-800/60">
              <DevicesCapabilities />
            </div>
            <div className="mt-10 sm:mt-12">
              <DevicesCards />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
