"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { AgentKind } from "./agent-script";
import {
  levelBlurb,
  levelLabel,
  levelAfterModelPick,
  levelsFor,
  menuEffect,
  modelLabel,
  modelsFor,
  offers,
  type ModelPick,
} from "./agent-models";
import { Tooltip } from "./tooltip";
import { FOCUS_RING, PRESS } from "./ui";

const PANEL_W = 232;
const FLYOUT_W = 226; // 220 of box plus the 6px gap its wrapper pads.
const GAP = 8;

const ROW =
  "mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px] leading-4 transition-colors";
// No overflow-hidden here: the panel is the containing block for the flyout that
// hangs outside it, and clipping the panel clips the flyout out of existence.
const BOX = "menu-pop rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] shadow-2xl";

type Column = "model" | "level";

/** Where the menu goes. Terminal panes clip their overflow, so a menu left in
 *  the composer loses its flyout as soon as the pane is narrower than the two
 *  boxes side by side — a split pane, exactly. It is lifted into the demo
 *  window instead, which is what the app does with its own: the window is the
 *  only clipping edge, and the flyout hangs over whatever sits beside the pane. */
type Placement = {
  frame: HTMLElement;
  right: number;
  bottom: number;
  // Left by default — the button sits at the pane's right edge — but a pane at
  // the window's left edge can leave less room there than the flyout needs.
  flyoutLeft: boolean;
};

/** The composer's model switcher, beside Send. Models are the list; the levels
 *  for whichever one is highlighted sit in a flyout opening leftward, since the
 *  button is already at the pane's right edge. Picking a model leaves the level
 *  alone; picking a level applies both at once. */
export function ComposerModelPicker({
  agent,
  pick,
  onPick,
}: {
  agent: AgentKind;
  pick: ModelPick;
  onPick: (next: ModelPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<Column>("model");
  // Which model the flyout is showing, and which level is highlighted in it.
  // Highlight only — nothing is applied until a row is clicked.
  const [cursorModel, setCursorModel] = useState(pick.model);
  const [cursorLevel, setCursorLevel] = useState(pick.effort);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // The menu is placed by measurement, so a relayout would leave it adrift.
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const models = modelsFor(agent);
  const levels = levelsFor(agent);
  // A cursor carried across models can point at a level the new one doesn't
  // offer; read through this and it highlights nothing and commits nothing.
  const level = offers(agent, cursorModel, cursorLevel) ? cursorLevel : "";
  const blurb = column === "level" && level ? levelBlurb(agent, level) : "";
  const effect = menuEffect(agent, { column, model: cursorModel, level }, pick);

  const commit = (next: ModelPick) => {
    setOpen(false);
    setCursorModel(next.model);
    setCursorLevel(next.effort);
    setColumn("model");
    onPick(next);
  };

  // Measured as the menu opens, before it first paints, so it never flashes at
  // an unplaced spot. Outside the demo window there is nothing to lift it into,
  // and it stays anchored to the button.
  const place = (): Placement | null => {
    const trigger = ref.current?.getBoundingClientRect();
    const frame = ref.current?.closest<HTMLElement>(".replica-ui");
    if (!trigger || !frame) return null;
    const box = frame.getBoundingClientRect();
    const room = trigger.right - PANEL_W - box.left;
    return {
      frame,
      right: box.right - trigger.right,
      bottom: box.bottom - trigger.top + GAP,
      flyoutLeft: room >= FLYOUT_W || room >= box.right - trigger.right,
    };
  };

  const toggle = () => {
    if (open) return setOpen(false);
    setColumn("model");
    setCursorModel(pick.model);
    setCursorLevel(pick.effort);
    setPlacement(place());
    setOpen(true);
  };

  const flyoutLeft = placement?.flyoutLeft ?? true;

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Model"
      style={placement ? { right: placement.right, bottom: placement.bottom } : undefined}
      className={`absolute z-50 w-[232px] ${placement ? "" : "bottom-full right-0 mb-2"} ${BOX}`}
    >
      <Header label="Model" />
      <div className="max-h-[236px] overflow-y-auto pb-1">
        {models.map((m) => (
          <Row
            key={m.value}
            label={m.label}
            checked={pick.model === m.value}
            cursor={cursorModel === m.value}
            dim={column === "level"}
            onEnter={() => {
              setColumn("model");
              setCursorModel(m.value);
            }}
            onClick={() =>
              commit({
                model: m.value,
                effort: levelAfterModelPick(agent, m.value, pick.effort),
              })
            }
          />
        ))}
      </div>

      {/* What the highlighted row means, and what clicking it will send. The
          second line is the only place the model-only vs model+level split
          is ever stated — the rows alone can't show it. */}
      <div className="border-t border-[#2e2e2e] px-3 py-2">
        <div className="h-[30px] text-[11px] leading-[15px]">
          {blurb ? (
            <>
              <p className="truncate text-[#b3b3b3]">{blurb}</p>
              <p className="truncate text-[#8e8e8e]">{effect}</p>
            </>
          ) : (
            <p className="line-clamp-2 text-[#8e8e8e]">{effect}</p>
          )}
        </div>
      </div>

      {agent === "codex" && (
        // Codex's picker is the only way in, and confirming it writes
        // ~/.codex/config.toml — so a pick here moves every later codex
        // session too, not just this terminal.
        <p className="border-t border-[#2e2e2e] px-3 py-1.5 text-[10.5px] leading-snug text-[#8e8e8e]">
          Codex saves this as your default for new sessions too.
        </p>
      )}

      {/* Pinned to the panel, not to the hovered row: a flyout that
          re-anchors per row jumps down the screen as the pointer scans the
          list. Only its contents change, so running the list is still. The
          6px gap is padding on this wrapper, not space between two boxes, so
          leaving a row sideways lands the pointer straight in the flyout. */}
      <div
        className={`absolute top-0 z-10 w-[226px] ${
          flyoutLeft ? "right-full pr-1.5" : "left-full pl-1.5"
        }`}
      >
        <div className={`flex max-h-[290px] flex-col overflow-hidden ${BOX}`}>
          <Header label="Level" />
          <div className="pb-1">
            {levels.map((l) => {
              const ok = offers(agent, cursorModel, l.value);
              return (
                <Row
                  key={l.value}
                  prefix={models.find((m) => m.value === cursorModel)?.label ?? cursorModel}
                  label={l.label}
                  checked={ok && pick.model === cursorModel && pick.effort === l.value}
                  cursor={column === "level" && level === l.value}
                  disabled={!ok}
                  onEnter={() => {
                    if (!ok) return;
                    setColumn("level");
                    setCursorLevel(l.value);
                  }}
                  onClick={() => commit({ model: cursorModel, effort: l.value })}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <Tooltip
        content={open ? "" : `Model  ·  ${modelLabel(agent, pick.model)} ${levelLabel(agent, pick.effort)}`}
        delay={500}
      >
        <button
          type="button"
          aria-label={`Model: ${modelLabel(agent, pick.model)} ${levelLabel(agent, pick.effort)}`}
          aria-haspopup="menu"
          aria-expanded={open}
          // Don't pull focus off the field, so the caret stays where it was.
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] leading-none hover:bg-[rgba(255,255,255,0.06)] ${
            open ? "bg-[rgba(255,255,255,0.06)]" : ""
          } ${PRESS} ${FOCUS_RING}`}
        >
          {/* The model reads at full strength and the level sits beside it a
              shade quieter — the two halves are one phrase, not a label and a tag. */}
          <span className="max-w-[112px] truncate text-[#cccccc]">
            {modelLabel(agent, pick.model)}
          </span>
          <span className="max-w-[72px] truncate text-[#8e8e8e]">
            {levelLabel(agent, pick.effort)}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-[#8e8e8e]" strokeWidth={2} />
        </button>
      </Tooltip>

      {open && (placement ? createPortal(menu, placement.frame) : menu)}
    </div>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#8e8e8e]">
      <span>{label}</span>
    </div>
  );
}

function Row({
  label,
  prefix,
  checked,
  cursor,
  dim,
  disabled,
  onEnter,
  onClick,
}: {
  label: string;
  prefix?: string;
  checked: boolean;
  cursor: boolean;
  dim?: boolean;
  disabled?: boolean;
  onEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      disabled={disabled}
      // Don't pull focus off the field, so the caret stays where it was.
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onEnter}
      onClick={onClick}
      className={`${ROW} ${
        cursor ? (dim ? "bg-[rgba(255,255,255,0.035)]" : "bg-[#2a2a2a]") : ""
      } ${
        disabled
          ? "cursor-default text-[#8e8e8e] opacity-40"
          : checked
            ? "font-medium text-[#e5e5e5]"
            : "text-[#b3b3b3] hover:text-[#e5e5e5]"
      }`}
    >
      {/* A radio mark, not a tick: the row is one choice among alternatives,
          which is also what its role says. Leading, so every label starts on the
          same line and the filled one is found by shape. */}
      <span
        aria-hidden
        className={`h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] ${
          checked ? "border-[#22d3ee] bg-[#22d3ee]" : "border-[#8e8e8e] opacity-60"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">
        {prefix && <span className="text-[#8e8e8e] opacity-60">{prefix} </span>}
        {label}
      </span>
    </button>
  );
}
