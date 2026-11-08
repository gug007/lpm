"use client";

import { useId, useState, type ReactNode } from "react";
import { ADD_HOST_CYCLE_MS } from "@/app/run-claude-code-on-a-remote-server/_components/add-host-demo";
import { PAIR_CYCLE_MS } from "@/app/run-claude-code-on-a-mac-mini/_components/use-pair-sequence";
import { DevicesCapabilities } from "@/components/home/devices-capabilities";
import { ComputerPanel, ServerPanel } from "@/components/home/devices-panels";
import { PhoneScene } from "@/components/home/devices-phone-scene";
import {
  DevicesTabs,
  tabId,
  type DeviceTab,
} from "@/components/home/devices-tabs";
import { HANDOFF_CYCLE_MS } from "@/components/home/paired-devices-loop";
import { useDeviceRotation } from "@/components/home/use-device-rotation";
import { SectionHeader } from "@/components/section-header";
import { detectedOs, usePlatform } from "@/lib/use-platform";

const SCENE_MS: Record<DeviceTab, number> = {
  iphone: HANDOFF_CYCLE_MS,
  computer: PAIR_CYCLE_MS,
  server: ADD_HOST_CYCLE_MS,
};

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
      "When Claude Code, Codex or Gemini CLI needs you, your iPhone gets a notification. Answer from the phone, then take control back at your desk — one session, running on your Mac the whole time.",
    summary:
      "An illustration of one Claude Code session on a Mac and an iPhone. The agent tightens a login rate limiter in lpm on the Mac, then stops to ask before committing, and the locked iPhone gets a notification. Opening it brings up the same terminal on the phone, which takes control, so the Mac shows “Active in iPhone” with a Take control button. From the phone you answer “yes — commit & open the PR” and the agent carries on. Then the Mac takes control back and the phone shows the terminal is active there.",
  },
  // The home copy for Windows and Linux visitors.
  homePc: {
    title: "The same terminal, on your computer and in your pocket",
    description:
      "When Claude Code, Codex or Gemini CLI needs you, your iPhone gets a notification. Answer from the phone, then take control back at your desk — one session, running on your computer the whole time.",
  },
  computer: {
    title: "Your other computers, in the same sidebar",
    description:
      "Pair a Mac mini or another computer running lpm, and its projects appear in your sidebar. Start Claude Code and Codex there, and they keep working when your laptop closes.",
  },
  server: {
    title: "A Linux server that keeps your agents running",
    description:
      "Type user@server and lpm sets itself up there. Services and agents keep running after your laptop closes.",
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
  const [paused, setPaused] = useState(false);
  // The iPhone page only ever shows the phone.
  const { stageRef, tab, run, rotating, playing, select, advance, stop } =
    useDeviceRotation(companionLink);
  const onPhoneTab = tab === "iphone";
  const idBase = useId();
  const panelId = `${idBase}-panel`;

  const os = detectedOs(usePlatform());
  const onPc = os === "windows" || os === "linux";

  const copy = companionLink ? COPY.home : COPY.mobile;
  const heading = !onPhoneTab
    ? COPY[tab]
    : companionLink && onPc
      ? COPY.homePc
      : copy;

  const scenes: { id: DeviceTab; render: (active: boolean) => ReactNode }[] = [
    {
      id: "iphone",
      render: (active) => (
        <PhoneScene
          active={active}
          paused={paused}
          onTogglePause={() => {
            stop();
            setPaused((p) => !p);
          }}
          summary={copy.summary}
          appStore={companionLink}
        />
      ),
    },
  ];
  if (companionLink) {
    scenes.push(
      {
        id: "computer",
        render: (active) => <ComputerPanel active={active} />,
      },
      { id: "server", render: (active) => <ServerPanel active={active} /> },
    );
  }

  return (
    <section
      data-pd-paused={paused || !onPhoneTab || undefined}
      className={`${flush ? "pb-16 sm:pb-20" : "py-16 sm:py-20"} overflow-x-clip`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className={companionLink ? "mb-8" : "mb-12"}
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
          title={heading.title}
          description={
            // Three lines from md up, the longest of the three, so the tabs
            // don't jump when a shorter description comes round.
            <span className="block md:min-h-[3lh]">{heading.description}</span>
          }
        />

        {companionLink && (
          <div className="mb-12">
            <DevicesTabs
              value={tab}
              onChange={select}
              idBase={idBase}
              panelId={panelId}
              progress={
                rotating
                  ? { ms: SCENE_MS[tab], run, playing, onEnd: advance }
                  : null
              }
            />
          </div>
        )}

        {/* From md up every scene sits in the same grid cell, so the stage
            is always as tall as the tallest and switching never moves what
            follows. Only the current scene plays; a fresh key restarts it. */}
        <div
          ref={stageRef}
          id={panelId}
          role={companionLink ? "tabpanel" : undefined}
          aria-labelledby={companionLink ? tabId(idBase, tab) : undefined}
          className="md:grid"
        >
          {scenes.map(({ id, render }) => {
            const current = id === tab;
            return (
              <div
                key={current ? `${id}-${run}` : id}
                inert={!current}
                className={`md:col-start-1 md:row-start-1 md:self-center ${
                  current ? "" : "max-md:hidden md:invisible"
                }`}
              >
                {render(current && playing)}
              </div>
            );
          })}
        </div>

        {/* While the tabs play in turn the phone's extras stay put, so the
            page below doesn't jump as scenes come and go. */}
        {companionLink && (onPhoneTab || rotating) && (
          <div className="mt-10 border-t border-gray-200 pt-10 sm:mt-14 sm:pt-12 dark:border-gray-800/60">
            <DevicesCapabilities />
          </div>
        )}
      </div>
    </section>
  );
}
