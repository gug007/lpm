"use client";

import { useEffect, useState } from "react";
import PaceCard from "./pace-card";
import PaceControls from "./pace-controls";
import PaceExplanation from "./pace-explanation";
import { WINDOW, computePace, explainPace, resetText, type WindowKind } from "./pace-model";
import {
  DEFAULT_PRESET,
  PRESETS,
  type Preset,
  type PresetId,
  type Provider,
} from "./pace-presets";
import { trackOnce } from "./track-once";
import { useClientNow } from "./use-client-now";

type SimState = {
  presetId: PresetId | null;
  provider: Provider;
  kind: WindowKind;
  elapsedMinutes: number;
  used: number;
};

const ANNOUNCE_DELAY_MS = 500;

const RESET_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const fromPreset = ({ id, provider, kind, elapsedMinutes, used }: Preset): SimState => ({
  presetId: id,
  provider,
  kind,
  elapsedMinutes,
  used,
});

function carryElapsed(minutes: number, from: WindowKind, to: WindowKind): number {
  const { step, max } = WINDOW[to];
  const snapped = Math.round(((minutes / WINDOW[from].minutes) * WINDOW[to].minutes) / step) * step;
  return Math.max(0, Math.min(max, snapped));
}

export default function PaceSimulator() {
  const [state, setState] = useState<SimState>(() => fromPreset(DEFAULT_PRESET));
  const [touched, setTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const now = useClientNow();

  const { provider, kind, elapsedMinutes, used, presetId } = state;
  const pace = computePace(used, elapsedMinutes, WINDOW[kind].minutes);
  const summary = explainPace(pace, used);
  const resetIn = resetText(pace.resetInMs);
  const resetLine =
    now === null
      ? resetIn
      : `${resetIn} · ${new Date(now + pace.resetInMs).toLocaleString(undefined, RESET_FORMAT)}`;

  useEffect(() => {
    if (!touched) return;
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [touched, summary]);

  const edit = (patch: Partial<SimState>, action: "pace-window" | "pace-slider") => {
    setState((current) => ({ ...current, ...patch, presetId: null }));
    setTouched(true);
    trackOnce(action);
  };

  const chooseKind = (next: WindowKind) => {
    if (next === kind) return;
    edit({ kind: next, elapsedMinutes: carryElapsed(elapsedMinutes, kind, next) }, "pace-window");
  };

  const choosePreset = (id: PresetId) => {
    setState(fromPreset(PRESETS.find((preset) => preset.id === id) ?? DEFAULT_PRESET));
    setTouched(true);
    trackOnce("pace-preset");
  };

  return (
    <div className="mx-auto max-w-5xl rounded-[2rem] border border-gray-200 bg-gray-50/60 p-4 sm:p-6 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4">
          <PaceCard
            provider={provider}
            kind={kind}
            used={used}
            pace={pace}
            resetLine={resetLine}
          />
          <PaceExplanation pace={pace} used={used} />
        </div>
        <PaceControls
          kind={kind}
          elapsedMinutes={elapsedMinutes}
          used={used}
          presetId={presetId}
          onKind={chooseKind}
          onElapsed={(minutes) => edit({ elapsedMinutes: minutes }, "pace-slider")}
          onUsed={(percent) => edit({ used: percent }, "pace-slider")}
          onPreset={choosePreset}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
