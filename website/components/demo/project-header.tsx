"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DemoAction, DemoProject } from "./projects";
import { actionButtonStyle } from "./action-colors";
import { CreateActionButton } from "./create-action-button";
import { OpenInDropdown } from "./open-in-dropdown";
import { StartControl } from "./start-control";
import { FOCUS_RING, PRESS } from "./ui";

const ROW_GAP = 8;

// What a utility action's chip spends its width on, richest first. Agents are
// the headline feature and keep both their mark and their label at every width;
// a utility action gives up its emoji before its label, because the label is
// what makes it read as a command rather than as decoration. Carrying both is
// not on the menu: four such chips measure 424px and the leftover row they sit
// in is never wider than 402.
const CHIP_MODES = ["label", "emoji", "hidden"] as const;
type ChipMode = (typeof CHIP_MODES)[number];

// A container query can't answer this. What the chips are competing for is the
// width left over after the project title, and `docs-site` and `auth-service-wt`
// leave very different amounts of it — as do projects with two header actions
// and projects with four. So measure, with the same hysteresis as the app's own
// useOverflowWrap: remember what each mode asked for, so a pane that grows can
// hand the labels back.
//
// At 768 — the narrowest width the demo supports — the two agent chips alone
// still overrun that leftover row by ~78px, and no scroll position hides it:
// one of the two product names is always sliced. So take the app's own way out
// and give the chips a full-width row of their own rather than cut the names.
function useChipLayout(signature: string) {
  const headRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const asked = useRef(new Map<string, number>());
  const painted = useRef<ChipMode>("label");
  const [mode, setMode] = useState<ChipMode>("label");
  const [wrapped, setWrapped] = useState(false);

  const measure = useCallback(() => {
    const head = headRef.current;
    const row = rowRef.current;
    const strip = stripRef.current;
    if (!head || !row || !strip) return;
    // Charging the strip its gap whether or not it currently sits in the row
    // keeps `free` identical on both sides of a wrap, so the two layouts cannot
    // take turns.
    let free = row.clientWidth;
    for (const child of row.children)
      if (child !== strip) free -= child.getBoundingClientRect().width + ROW_GAP;
    // The strip is the only child that can shrink, so `free` never depends on
    // what the chips are currently showing and the choice below can't oscillate.
    asked.current.set(`${signature}|${painted.current}`, strip.scrollWidth);
    const asks = (m: ChipMode) => asked.current.get(`${signature}|${m}`) ?? 0;
    const inline = CHIP_MODES.find((m) => asks(m) <= free);
    if (inline) {
      setMode(inline);
      setWrapped(false);
      return;
    }
    // Wrapping only earns its ~40px of pane height if a full-width row actually
    // holds the chips; when even that overruns, stay inline and scroll.
    const ownRow = CHIP_MODES.find((m) => asks(m) <= head.clientWidth);
    setMode(ownRow ?? "hidden");
    setWrapped(ownRow !== undefined);
  }, [signature]);

  useLayoutEffect(() => {
    painted.current = mode;
    measure();
  }, [mode, wrapped, measure]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure]);

  return { mode, wrapped, headRef, rowRef, stripRef };
}

function HeaderActionButton({
  action,
  mode,
  onRun,
  buttonRef,
}: {
  action: DemoAction;
  mode: ChipMode;
  // Told whether a visitor pressed it, rather than the tour.
  onRun: (trusted: boolean) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const utility = !action.agent;
  if (utility && mode === "hidden") return null;
  const emoji = action.emoji && (!utility || mode === "emoji");
  const label = !utility || mode === "label" || !action.emoji;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(event) => onRun(event.nativeEvent.isTrusted)}
      title={action.label}
      data-tour={`action:${action.name}`}
      style={actionButtonStyle(action.color)}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#2e2e2e] bg-[var(--action-tint,#242424)] px-3.5 text-xs font-medium text-[#b3b3b3] hover:bg-[var(--action-tint-strong,rgba(255,255,255,0.1))] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING}`}
    >
      {emoji && <span className="text-[13px] leading-none">{action.emoji}</span>}
      {label && <span>{action.label}</span>}
    </button>
  );
}

type HeaderProps = {
  project: DemoProject;
  anyRunning: boolean;
  headerActions: DemoAction[];
  startOpen: boolean;
  runningServices: Set<string>;
  onToggleStart: () => void;
  onCloseStart: () => void;
  onStartStop: () => void;
  onStartProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onOpenAction: (a: DemoAction, trusted: boolean) => void;
  onAddAction: () => void;
  startButtonRef?: React.Ref<HTMLButtonElement>;
  agentButtonRef?: React.RefObject<HTMLButtonElement | null>;
  codexButtonRef?: React.RefObject<HTMLButtonElement | null>;
  startRingPulse?: boolean;
};

export function ProjectHeader({
  project,
  anyRunning,
  headerActions,
  startOpen,
  runningServices,
  onToggleStart,
  onCloseStart,
  onStartStop,
  onStartProfile,
  onToggleService,
  onOpenAction,
  onAddAction,
  startButtonRef,
  agentButtonRef,
  codexButtonRef,
  startRingPulse,
}: HeaderProps) {
  const agentAction = headerActions.find((a) => a.agent === "claude");
  const codexAction = headerActions.find((a) => a.agent === "codex");
  const title = project.label ?? project.name;
  const { mode, wrapped, headRef, rowRef, stripRef } = useChipLayout(
    `${title}|${headerActions.map((a) => a.label).join(" ")}`,
  );
  // `self-end` keeps the strip shrink-to-fit on its own row, so scrollWidth
  // stays the width the chips ask for rather than the width of the row.
  const strip = (
    <div
      ref={stripRef}
      className={`scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto ${wrapped ? "self-end" : ""}`}
    >
      {headerActions.map((a) => (
        <HeaderActionButton
          key={a.name}
          action={a}
          mode={mode}
          buttonRef={
            a === agentAction
              ? agentButtonRef
              : a === codexAction
                ? codexButtonRef
                : undefined
          }
          onRun={(trusted) => onOpenAction(a, trusted)}
        />
      ))}
    </div>
  );
  return (
    // Named so the demo frame can measure it: the tour's hint pill hangs below
    // this header, which is two rows deep once the chips wrap.
    <div
      data-demo-header={project.name}
      className="flex shrink-0 flex-col gap-2 px-3 py-1"
    >
      <div ref={headRef} className="flex items-center gap-4">
        <div className="min-w-[5ch] truncate pr-2 text-xl font-semibold tracking-tight text-[#e5e5e5]">
          {title}
        </div>
        <div ref={rowRef} className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {!wrapped && strip}
          <CreateActionButton onClick={onAddAction} />
          <OpenInDropdown projectName={title} />
          <StartControl
            project={project}
            running={anyRunning}
            runningServices={runningServices}
            open={startOpen}
            onToggleMenu={onToggleStart}
            onCloseMenu={onCloseStart}
            onStartStop={onStartStop}
            onStartProfile={onStartProfile}
            onToggleService={onToggleService}
            startButtonRef={startButtonRef}
            ringPulse={startRingPulse}
          />
        </div>
      </div>
      {wrapped && strip}
    </div>
  );
}
