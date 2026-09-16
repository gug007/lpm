import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import {
  effortLabel,
  modelLabel,
  pickSummary,
  switchEffortUnion,
  switchEfforts,
  switchModels,
  type ModelPick,
  type SwitchableCLI,
} from "../agentModelSwitch";
import { effortBlurb, menuEffect, type MenuCursor } from "../agentModelMenu";
import { useAgentModelMenuKeys } from "../hooks/useAgentModelMenuKeys";
import { ComposerModelMenuRow as Row } from "./ComposerModelMenuRow";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

const PANEL_WIDTH = 232;
// Fits the longest "<model> <level>" row, so the flyout keeps one width as the
// cursor moves between models instead of resizing under the pointer.
const FLYOUT_WIDTH = 220;
const FLYOUT_GAP = 6;
// Codex's nine models scroll past this rather than pushing the panel over the
// terminal output behind it.
const LIST_MAX_HEIGHT = 236;

type Column = "model" | "effort";

interface ComposerModelButtonProps {
  // Which agent runs in the target terminal — it decides both the model list and
  // how a pick is delivered.
  cli: SwitchableCLI;
  // What lpm last saw the session running. Either half may be empty when that
  // half was never observed, which just leaves its rows unchecked.
  pick: ModelPick;
  // True while a switch is in flight; the trigger locks so two can't interleave.
  applying: boolean;
  // Re-read the running model from the pane and hand the reading back, so the
  // menu can open on what is running. The `pick` prop is a render too old to
  // carry a reading taken in this same click.
  onOpen: () => ModelPick;
  onPick: (want: Partial<ModelPick>) => void;
}

// Footer control that re-points the running agent at another model or reasoning
// level. Models are the list; the levels for whichever one is highlighted sit in
// a flyout beside it, so the panel itself stays as narrow as the button row it
// hangs off.
export function ComposerModelButton({
  cli,
  pick,
  applying,
  onOpen,
  onPick,
}: ComposerModelButtonProps) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<Column>("model");
  // Which model the flyout is showing, and which level is highlighted in it.
  // Highlight only — nothing is applied until a row is committed.
  const [cursorModel, setCursorModel] = useState("");
  const [cursorEffort, setCursorEffort] = useState("");
  // Enter only commits once the keyboard has actually been used to move the
  // cursor. Opened by mouse and left alone, the menu must not take an Enter the
  // user meant for the prompt they were writing.
  const keyboardUsed = useRef(false);
  const rowId = useId();

  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: "above",
    // The button sits at the composer's right edge beside Send, so the panel
    // hangs off its right edge and the flyout opens leftward, into the pane.
    align: "right",
    flip: true,
  });

  useOverlay(open);

  const models = useMemo(() => switchModels(cli), [cli]);
  const cursorModelLabel = models.find((m) => m.value === cursorModel)?.label ?? cursorModel;
  // Every level any model of this CLI offers. The flyout renders the union and
  // greys out what the highlighted model can't take, so it keeps one height as
  // the pointer runs down the model list instead of growing and shrinking under
  // it. It also shows *why* a level is missing: Haiku's Ultracode row is
  // visibly unavailable rather than quietly absent.
  const levelRows = useMemo(() => switchEffortUnion(cli), [cli]);
  const allowed = useMemo(
    () => new Set(switchEfforts(cli, cursorModel).map((e) => e.value)),
    [cli, cursorModel],
  );
  // A cursor carried across models can point at a row the new one doesn't offer;
  // read through this and it highlights nothing and commits nothing.
  const effortCursor = allowed.has(cursorEffort) ? cursorEffort : "";
  const cursor: MenuCursor = { column, model: cursorModel, effort: effortCursor };

  const choose = useCallback(
    (want: Partial<ModelPick>) => {
      setOpen(false);
      onPick(want);
    },
    [onPick],
  );

  // Committing a level under the model already running is a level change, not a
  // model change — re-sending "/model" would be noise in Claude's transcript,
  // and Codex re-picks its current row on its own.
  const commit = useCallback(() => {
    if (column === "model") {
      if (cursorModel) choose({ model: cursorModel });
      return;
    }
    if (!effortCursor) return;
    choose(
      cursorModel === pick.model
        ? { effort: effortCursor }
        : { model: cursorModel, effort: effortCursor },
    );
  }, [choose, column, effortCursor, cursorModel, pick.model]);

  const effortValues = useMemo(
    () => levelRows.filter((x) => allowed.has(x.value)).map((x) => x.value),
    [levelRows, allowed],
  );
  const move = useCallback(
    (value: string) => (column === "model" ? setCursorModel(value) : setCursorEffort(value)),
    [column],
  );
  const toOtherColumn = useCallback(
    (forward: boolean) => {
      if (!forward) return setColumn("model");
      setColumn("effort");
      setCursorEffort((v) => (allowed.has(v) ? v : (effortValues[0] ?? "")));
    },
    [allowed, effortValues],
  );
  const close = useCallback(() => setOpen(false), []);

  useAgentModelMenuKeys({
    open,
    list: column === "model" ? models.map((m) => m.value) : effortValues,
    current: column === "model" ? cursorModel : effortCursor,
    hasOtherColumn: column === "model" && effortValues.length > 0,
    flyoutSide: "left",
    used: keyboardUsed,
    move,
    toOtherColumn,
    commit,
    close,
  });

  // Keep the keyboard cursor on screen once the list scrolls — Codex's nine
  // models overflow. Only for keyboard moves: scrolling under the pointer would
  // fight a mouse user.
  const activeRowId = `${rowId}-${column}-${column === "model" ? cursorModel : effortCursor}`;
  useEffect(() => {
    if (!open || !keyboardUsed.current) return;
    document.getElementById(activeRowId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeRowId]);

  // Keep clicks from pulling focus off the composer editor; the caret stays put.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Seed from the reading onOpen just took, not from `pick` — that prop is
    // this render's, one behind the store write onOpen makes.
    const now = onOpen();
    keyboardUsed.current = false;
    setColumn("model");
    setCursorModel(now.model || models[0]?.value || "");
    setCursorEffort(now.effort);
    setOpen(true);
  };

  const summary = pickSummary(cli, pick);
  const modelText = pick.model ? modelLabel(cli, pick.model) : "";
  const effortText = pick.effort ? effortLabel(cli, pick.model, pick.effort) : "";
  const blurb = column === "effort" ? effortBlurb(cli, effortCursor) : "";
  const effect = cursorModel ? menuEffect(cli, cursor, pick) : "";

  return (
    <div ref={triggerRef}>
      <Tooltip
        content={summary ? `Model  ·  ${summary}` : "Model"}
        delay={COMPOSER_TOOLTIP_DELAY_MS}
      >
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={toggle}
          disabled={applying}
          aria-label={summary ? `Model: ${summary}` : "Model"}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12px] leading-none transition-colors hover:bg-[var(--composer-hover-bg)] disabled:opacity-60 ${
            open ? "bg-[var(--composer-hover-bg)]" : ""
          }`}
        >
          {/* The model reads at full strength and the level sits beside it a
              shade quieter — the two halves are read as one phrase, not as a
              label and a tag. With nothing read back yet, a placeholder in the
              same quiet tone as the icons around it. */}
          {modelText ? (
            <>
              <span className="max-w-[112px] truncate text-[var(--composer-fg)]">{modelText}</span>
              {effortText && (
                <span className="max-w-[72px] truncate text-[var(--composer-fg-muted)]">
                  {effortText}
                </span>
              )}
            </>
          ) : (
            <span className="text-[var(--composer-fg-muted)]">Model</span>
          )}
          {/* The spinner takes the chevron's slot rather than adding one, so a
              switch in flight doesn't shift the whole button row. */}
          {applying ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-[var(--composer-fg-muted)]" />
          ) : (
            <ChevronDown
              size={12}
              strokeWidth={2}
              className="shrink-0 text-[var(--composer-fg-muted)]"
            />
          )}
        </button>
      </Tooltip>

      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="menu"
            // `relative` makes this the flyout's containing block, and the panel
            // keeps visible overflow so the flyout can hang outside it. The rows
            // scroll in their own box — the flyout is deliberately NOT in that
            // box, since a scroll container clips both axes once either one is
            // non-visible and would cut it off at the panel's edge.
            className="relative z-[80] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
          >
            <ColumnHeader
              label="Model"
              // Nothing read back yet — a terminal that hasn't drawn its
              // banner or status line, or whose scrollback has outrun both —
              // so say that rather than show unchecked rows that read as
              // "none set".
              note={!pick.model ? "not reported" : undefined}
            />
            <div style={{ maxHeight: LIST_MAX_HEIGHT }} className="overflow-y-auto pb-1">
              {models.map((m) => (
                <Row
                  key={m.value}
                  id={`${rowId}-model-${m.value}`}
                  label={m.label}
                  checked={pick.model === m.value}
                  // The highlight stays on the model the flyout belongs to even
                  // while the cursor is inside it, dimmed, so the pairing never
                  // goes unstated.
                  cursor={cursorModel === m.value}
                  dim={column === "effort"}
                  onMouseDown={keepEditorFocus}
                  onMouseEnter={() => {
                    setColumn("model");
                    setCursorModel(m.value);
                  }}
                  onClick={() => choose({ model: m.value })}
                />
              ))}
            </div>

            {/* What the highlighted row means, and what committing it will send.
                The second line is the only place the model-only vs model+level
                split is ever stated — the rows alone can't show it. */}
            <div className="border-t border-[var(--border)] px-3 py-2">
              {/* A fixed two-line box, so the panel never resizes as the cursor
                  moves. A level row fills it with its description over the
                  effect; a model row has no description, so the effect takes
                  both lines rather than leaving one blank and clipping. */}
              <div className="h-[30px] text-[11px] leading-[15px]">
                {blurb ? (
                  <>
                    <p className="truncate text-[var(--text-secondary)]">{blurb}</p>
                    <p className="truncate text-[var(--text-muted)]">{effect}</p>
                  </>
                ) : (
                  <p className="line-clamp-2 text-[var(--text-muted)]">{effect}</p>
                )}
              </div>
            </div>

            {cli === "codex" && (
              // Codex's picker is the only way in, and confirming it writes
              // ~/.codex/config.toml — so a pick here moves every later codex
              // session too, not just this terminal. Worth saying out loud.
              <p className="border-t border-[var(--border)] px-3 py-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]">
                Codex saves this as your default for new sessions too.
              </p>
            )}

            {/* Pinned to the panel, not to the hovered row: a flyout that
                re-anchors per row jumps down the screen as the pointer scans the
                list. Only its contents change, so running the list is still. It
                opens to the left — the panel is already at the window's edge. */}
            <div
              style={{
                position: "absolute",
                top: 0,
                right: "100%",
                width: FLYOUT_WIDTH + FLYOUT_GAP,
                paddingRight: FLYOUT_GAP,
              }}
              className="z-[81]"
            >
              <div
                className="flex max-h-[min(260px,calc(100vh-120px))] flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
              >
                <ColumnHeader label="Level" />
                <div className="pb-1">
                  {levelRows.map((e) => {
                    const offered = allowed.has(e.value);
                    return (
                      <Row
                        key={e.value}
                        id={`${rowId}-effort-${e.value}`}
                        prefix={cursorModelLabel}
                        label={e.label}
                        checked={offered && pick.model === cursorModel && pick.effort === e.value}
                        cursor={column === "effort" && effortCursor === e.value}
                        disabled={!offered}
                        onMouseDown={keepEditorFocus}
                        onMouseEnter={() => {
                          if (!offered) return;
                          setColumn("effort");
                          setCursorEffort(e.value);
                        }}
                        onClick={() =>
                          choose(
                            cursorModel === pick.model
                              ? { effort: e.value }
                              : { model: cursorModel, effort: e.value },
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ColumnHeader({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      <span>{label}</span>
      {note && <span className="truncate font-normal normal-case tracking-normal opacity-80">{note}</span>}
    </div>
  );
}
