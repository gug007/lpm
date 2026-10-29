"use client";

import { useRef, type KeyboardEvent } from "react";
import { Laptop, Server, Smartphone, type LucideIcon } from "lucide-react";

export type DeviceTab = "iphone" | "computer" | "server";

const TABS: {
  id: DeviceTab;
  label: string;
  short: string;
  line: string;
  icon: LucideIcon;
}[] = [
  {
    id: "iphone",
    label: "iPhone",
    short: "iPhone",
    line: "Answer an agent from a push, then pick it up at your desk.",
    icon: Smartphone,
  },
  {
    id: "computer",
    label: "Another computer",
    short: "Computer",
    line: "Run agents on a Mac mini and follow them from your laptop.",
    icon: Laptop,
  },
  {
    id: "server",
    label: "Linux server",
    short: "Linux server",
    line: "Type user@server; agents keep running after you close the lid.",
    icon: Server,
  },
];

export const DEVICE_TABS: DeviceTab[] = TABS.map((t) => t.id);

export const tabId = (base: string, tab: DeviceTab) => `${base}-tab-${tab}`;

// The current scene's share of its turn, while the tabs play in turn.
export type TabProgress = {
  ms: number;
  run: number;
  playing: boolean;
  onEnd: () => void;
};

// A pill row on phones; from md up each tab is a card that says what its
// scene shows, with a bar under the one playing.
export function DevicesTabs({
  value,
  onChange,
  idBase,
  panelId,
  progress,
}: {
  value: DeviceTab;
  onChange: (tab: DeviceTab) => void;
  idBase: string;
  panelId: string;
  progress: TabProgress | null;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = TABS.findIndex((t) => t.id === value);
    const next = TABS[(at + step + TABS.length) % TABS.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Where your projects run"
      onKeyDown={onKeyDown}
      className="mx-auto flex w-fit gap-1 rounded-full bg-gray-100 p-1 ring-1 ring-inset ring-gray-200 md:grid md:w-full md:max-w-4xl md:grid-cols-3 md:gap-3 md:rounded-none md:bg-transparent md:p-0 md:ring-0 dark:bg-gray-800/60 dark:ring-white/10 md:dark:bg-transparent"
    >
      {TABS.map(({ id, label, short, line, icon: Icon }) => {
        const selected = id === value;
        const tid = tabId(idBase, id);
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={tid}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={`relative inline-flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-full px-3.5 text-[13px] transition-[color,background-color,box-shadow] sm:px-4 sm:text-sm md:h-auto md:flex-col md:items-start md:gap-1 md:rounded-2xl md:px-4 md:pb-4 md:pt-3.5 md:text-left ${
              selected
                ? "bg-white font-semibold text-gray-900 shadow-[0_0_0_1px_rgba(229,231,235,1),0_1px_3px_rgba(0,0,0,0.12)] md:shadow-[0_0_0_1px_rgba(209,213,219,1),0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#2e2e2e] dark:text-white dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] md:dark:bg-white/[0.06] md:dark:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                : "font-medium text-gray-600 hover:text-gray-900 md:shadow-[0_0_0_1px_rgba(229,231,235,1)] md:hover:shadow-[0_0_0_1px_rgba(209,213,219,1)] dark:text-gray-300 dark:hover:text-white md:dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] md:dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">
                {label}
              </span>
            </span>
            <span
              className="hidden text-[13px] font-normal leading-snug text-gray-500 md:block dark:text-gray-400"
            >
              {line}
            </span>
            {selected && progress && (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 bottom-2 hidden h-0.5 overflow-hidden rounded-full bg-gray-200 md:block dark:bg-white/10"
              >
                <span
                  key={progress.run}
                  onAnimationEnd={progress.onEnd}
                  className="block h-full origin-left bg-gray-900 dark:bg-white"
                  style={{
                    animationName: "demo-step-fill",
                    animationDuration: `${progress.ms}ms`,
                    animationTimingFunction: "linear",
                    animationFillMode: "forwards",
                    animationPlayState: progress.playing ? "running" : "paused",
                  }}
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
