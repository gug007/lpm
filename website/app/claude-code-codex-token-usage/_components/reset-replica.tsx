"use client";

import { useEffect, useRef, useState } from "react";
import { SEGMENTED, SEGMENT_OFF, SEGMENT_ON } from "./page-styles";
import ResetComposer from "./reset-composer";
import ResetDemoControls from "./reset-demo-controls";
import ResetPicker from "./reset-picker";
import ResetScheduled from "./reset-scheduled";
import {
  AGENT,
  CLOCK,
  DEFAULT_PICK,
  PICKS,
  PROJECT,
  SCENARIOS,
  SCENARIO_IDS,
  SEND_NOW,
  pickTarget,
  type Flag,
  type ScenarioId,
  type Sent,
  type Target,
} from "./reset-data";
import { trackOnce } from "./track-once";

type Demo = {
  scenario: ScenarioId;
  pick: number;
  target: Target | null;
  sent: Sent | null;
  canceled: Target | null;
  edited: boolean;
};

const INITIAL: Demo = {
  scenario: "fiveHour",
  pick: DEFAULT_PICK,
  target: null,
  sent: null,
  canceled: null,
  edited: false,
};

const EDITED_NOTE =
  "The prompt is back in the composer to edit, and lpm remembers its time for the next ⌥↵.";
const LAST_PICK = PICKS.length - 1;

export default function ResetReplica() {
  const [demo, setDemo] = useState<Demo>(INITIAL);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    const selector = focusNext.current;
    if (!selector) return;
    focusNext.current = null;
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  const go = (next: Demo, say: string, focus: string | null) => {
    setDemo(next);
    setMessage(say);
    focusNext.current = focus;
  };

  const scenario = SCENARIOS[demo.scenario];
  const pick = PICKS[demo.pick];

  const chooseScenario = (id: ScenarioId) => {
    if (id === demo.scenario) return;
    trackOnce("reset-scenario");
    go({ ...INITIAL, scenario: id }, "", null);
  };

  const schedule = (target: Target) => {
    trackOnce("reset-schedule");
    go({ ...demo, target, sent: null }, target.announce, '[data-focus="row"]');
  };

  const nudge = (dir: 1 | -1) => {
    const next = Math.min(LAST_PICK, Math.max(0, demo.pick + dir));
    const edge = next === 0 ? '[data-focus="later"]' : next === LAST_PICK ? '[data-focus="earlier"]' : null;
    go({ ...demo, pick: next }, `Today ${PICKS[next].time}, ${PICKS[next].countdown}`, edge);
  };

  const edit = () =>
    go({ ...demo, target: null, sent: null, edited: true }, EDITED_NOTE, '[data-focus="restart"]');

  const cancel = () =>
    go({ ...demo, target: null, sent: null, canceled: demo.target }, "Scheduled prompt canceled.", '[data-focus="undo"]');

  const undo = () =>
    go({ ...demo, target: demo.canceled, canceled: null }, "Scheduled again.", '[data-focus="row"]');

  const send = (sent: Sent) => {
    trackOnce("reset-advance");
    go({ ...demo, sent }, `Sent at ${sent.at}.`, '[data-focus="restart"]');
  };

  const onFlag = (flag: Flag) => schedule(flag.target);
  const onLimit = () => scenario.footerLimit && schedule(scenario.footerLimit.target);
  const target = demo.target;

  return (
    <div ref={rootRef}>
      <div className="mb-4 flex justify-center">
        <div role="group" aria-label="Scenario" className={SEGMENTED}>
          {SCENARIO_IDS.map((id, index) => (
            <button
              key={id}
              type="button"
              aria-pressed={demo.scenario === id}
              data-focus={index === 0 ? "chip" : undefined}
              onClick={() => chooseScenario(id)}
              className={`${demo.scenario === id ? SEGMENT_ON : SEGMENT_OFF} max-sm:min-h-11 max-sm:px-3`}
            >
              {SCENARIOS[id].chip}
            </button>
          ))}
        </div>
      </div>

      <div
        data-on-dark
        className="replica-ui rounded-2xl bg-[#0d0d0d] p-3 text-left text-[var(--text-primary)] ring-1 ring-black/10 sm:p-4 dark:ring-white/10"
      >
        <div className="mb-2.5 flex items-center justify-between gap-3 px-1 text-[11px] text-[var(--text-muted)]">
          <p>{`${PROJECT} · ${AGENT}`}</p>
          <p className="tabular-nums">{demo.sent?.clock ?? CLOCK}</p>
        </div>

        {demo.edited ? null : target || demo.canceled ? (
          <ResetScheduled
            target={target}
            sent={demo.sent}
            onSendNow={() => send(SEND_NOW)}
            onEdit={edit}
            onCancel={cancel}
            onUndo={undo}
          />
        ) : (
          <ResetPicker
            scenario={scenario}
            pick={pick}
            canEarlier={demo.pick > 0}
            canLater={demo.pick < LAST_PICK}
            onFlag={onFlag}
            onNudge={nudge}
            onLimit={onLimit}
            onCommit={() => schedule(pickTarget(pick))}
          />
        )}

        <div className={demo.edited ? "" : "mt-2.5"}>
          <ResetComposer empty={target !== null || demo.canceled !== null} />
        </div>
      </div>

      {(target || demo.canceled || demo.edited) && (
        <ResetDemoControls
          note={demo.edited ? EDITED_NOTE : null}
          skipLabel={target && !demo.sent ? target.skip : null}
          onSkip={() => target && send({ at: target.sentAt, clock: target.clock })}
          onRestart={() => go(INITIAL, "Back to the timeline.", '[data-focus="chip"]')}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
