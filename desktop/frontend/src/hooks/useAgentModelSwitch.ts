import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  claudeCurrentPick,
  claudeRefusals,
  claudeSwitchCommand,
  codexChangeBanners,
  codexCurrentPick,
  codexPickerView,
  findEffortRow,
  findModelRow,
  findMoreEffortsRow,
  modelLabel,
  moveKeys,
  selectedRow,
  switchEffectiveEffort,
  type ModelPick,
  type PickerRow,
  type PickerView,
  type SwitchableCLI,
} from "../agentModelSwitch";
import {
  captureInteractivePaneLog,
  hasInteractivePaneSession,
  interactivePaneOutputAt,
  isInteractivePaneSessionDead,
} from "../components/InteractivePane";
import {
  agentModelPick,
  mergeAgentModelPick,
  setAgentModelPick,
} from "../store/agentModelPicks";
import { sendTerminalInput } from "../terminal-io";

// Codex answers a keystroke with a redraw, so every wait below is "poll the pane
// until it says what we expect". The ceilings are generous — a busy pane can be
// mid-animation — but bounded, because the fallback (close the picker, say so)
// is always better than hanging on a UI that moved on.
const POLL_MS = 60;
const PICKER_OPEN_MS = 6000;
const PICKER_STEP_MS = 2500;
const PICKER_CONFIRM_MS = 6000;
const PICKER_CLOSE_MS = 1200;
// How long to give Claude to reject a level or model it won't take. Its usage
// line is printed as soon as the command runs, so this only has to outlast one
// redraw — and it sits between the two commands of a both-halves pick, so it is
// kept short.
const CLAUDE_REFUSAL_MS = 1200;
// How long a queued slash command waits for the pane to finish delivering the
// one before it. A short single-line command clears in well under a second.
const SUBMIT_FREE_MS = 4000;
// One retry's worth of cursor walking: the first pass can be written into a
// redraw that eats it, a second pass almost never is.
const MOVE_ATTEMPTS = 2;
// How far back a readback looks for what the agent runs. Claude prints its level
// only in the welcome banner and in "/effort" confirmations, both of which
// scroll off the viewport; Codex keeps its own status line live, so for it the
// viewport alone would do.
const READBACK_LINES = 200;
// The pane is re-read when its output stamp moves, checked this often; a burst
// of output is collapsed into one read after it goes quiet.
const READBACK_POLL_MS = 500;
const READBACK_SETTLE_MS = 300;

const ESCAPE = "\x1b";
const ENTER = "\r";

// Terminals with a switch in flight, and the narrower set whose agent currently
// has a picker open under lpm's control. Both are module-level, not component
// state: a switch must finish (or back itself out) even if the composer unmounts
// under it — the composer is keyed by terminal, so merely clicking another tab
// would otherwise abandon Codex's picker open.
const busy = new Set<string>();
const driving = new Set<string>();

/** True while lpm has this terminal's agent in a picker, so a prompt sent now
 *  would land there instead of reaching the agent. Only Codex is ever driven
 *  this way; Claude's switch is plain commands and blocks nothing. */
export function isSwitchingModel(terminalId: string): boolean {
  return driving.has(terminalId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AgentModelSwitch {
  /** True while a switch is in flight; the menu locks so two can't interleave. */
  applying: boolean;
  /** Point the running agent at a model, an effort level, or both. Whichever
   *  half is omitted is left as it is. */
  apply: (want: Partial<ModelPick>) => void;
  /** Re-read what the agent runs now, for CLIs that print it (Codex), and hand
   *  the reading back. Cheap and synchronous — called when the menu opens, whose
   *  own `pick` prop is a render too old to carry it. */
  refresh: () => ModelPick;
}

interface Options {
  terminalId: string;
  /** Null for a terminal running no switchable agent, which leaves the hook
   *  inert — it is still called, since hooks can't be conditional. */
  cli: SwitchableCLI | null;
  /** The composer's own delivery path — a gated paste plus a verified CR, which
   *  is what gets a slash command past an agent's async redraw. It already warns
   *  the user itself when a terminal won't take input, so a false return here is
   *  handled, not reported again. */
  submit: (text: string) => boolean;
}

export function useAgentModelSwitch({ terminalId, cli, submit }: Options): AgentModelSwitch {
  const [applying, setApplying] = useState(false);
  // Only the spinner is tied to this component's life. The switch itself is
  // tracked in the module sets above, so unmounting mid-walk stops the UI
  // updating without stranding the terminal in a half-driven picker.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The composer rebuilds its submit closure every render; read it through a ref
  // so `apply` keeps one identity and the button doesn't re-render with the host.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // The visible screen only, never scrollback: Codex redraws its whole viewport,
  // so a picker that has already been confirmed leaves nothing behind that could
  // be read as a live one.
  const screen = useCallback(() => captureInteractivePaneLog(terminalId, 0), [terminalId]);

  const refresh = useCallback(() => {
    if (cli) {
      const recent = captureInteractivePaneLog(terminalId, READBACK_LINES);
      const now = cli === "codex" ? codexCurrentPick(recent) : claudeCurrentPick(recent);
      if (now) mergeAgentModelPick(terminalId, now);
    }
    return agentModelPick(terminalId);
  }, [cli, terminalId]);

  // Keep the button's label current without the menu being opened: re-read the
  // pane whenever it has printed something new, once the burst settles. A
  // model switched from inside the terminal, or a level Claude clamped on the
  // way to a new model, shows up here.
  useEffect(() => {
    if (!cli) return;
    let seen = -1;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const at = interactivePaneOutputAt(terminalId);
      if (at === seen) return;
      seen = at;
      clearTimeout(settle);
      settle = setTimeout(refresh, READBACK_SETTLE_MS);
    };
    tick();
    const timer = setInterval(tick, READBACK_POLL_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(settle);
    };
  }, [cli, terminalId, refresh]);

  const apply = useCallback(
    (want: Partial<ModelPick>) => {
      const target: ModelPick = { model: want.model ?? "", effort: want.effort ?? "" };
      if (!cli || (!target.model && !target.effort)) return;
      if (busy.has(terminalId)) return;
      const run: Run = {
        terminalId,
        target,
        submit: (text) => submitRef.current(text),
        screen,
      };
      busy.add(terminalId);
      setApplying(true);
      if (cli === "codex") driving.add(terminalId);
      void (cli === "claude" ? applyClaude(run) : applyCodex(run)).finally(() => {
        busy.delete(terminalId);
        driving.delete(terminalId);
        if (mounted.current) setApplying(false);
      });
    },
    [cli, screen, terminalId],
  );

  return { applying, apply, refresh };
}

interface Run {
  terminalId: string;
  target: ModelPick;
  submit: (text: string) => boolean;
  screen: () => string;
}

// Claude Code takes the switch as plain slash commands, so there is nothing to
// drive — but a pick that sets both halves is two of them, and the composer's
// delivery path refuses a second while the first is still in flight. So they go
// one after the other, each waiting for the pane to take it. A command that
// draws no complaint is taken at its word here; the readback that polls the pane
// then corrects the label from what Claude actually printed.
async function applyClaude(run: Run): Promise<void> {
  const { target } = run;
  const landed: Partial<ModelPick> = {};
  for (const kind of ["model", "effort"] as const) {
    const value = target[kind];
    if (!value) continue;
    // Each command is checked for its own refusal before the next one goes, so
    // a level Claude won't take can't discredit the model it just accepted —
    // and only what survived is remembered, which needs no undo.
    const refusalsBefore = claudeRefusals(run.screen());
    const delivery = await submitWhenFree(run, claudeSwitchCommand(kind, value));
    if (delivery !== "sent") {
      if (delivery === "busy") {
        toast.error(`Couldn't send /${kind} — the terminal is still busy.`);
      }
      break;
    }
    const refused = await waitFor(
      () => (claudeRefusals(run.screen()) > refusalsBefore ? true : null),
      CLAUDE_REFUSAL_MS,
    );
    if (refused) {
      toast.error(`Claude wouldn't take ${kind} "${value}" — see the terminal for what it offers.`);
      break;
    }
    landed[kind] = value;
  }
  if (!landed.model && !landed.effort) return;
  // A model switch carries the old level along with it, and Claude silently
  // clamps one the new model doesn't take (Haiku has no "ultracode") without
  // saying what it clamped to — so a level the new model can't run is dropped
  // rather than reported as what the session is on.
  const prev = agentModelPick(run.terminalId);
  const model = landed.model || prev.model;
  setAgentModelPick(run.terminalId, {
    model,
    effort: switchEffectiveEffort("claude", model, landed.effort || prev.effort),
  });
}

/** How a command fared on its way to the terminal: delivered, refused by a
 *  terminal that is gone (the composer's submit has already said so), or never
 *  taken because the pane stayed busy for the whole window. */
type Delivery = "sent" | "gone" | "busy";

// The composer's submit refuses while a previous delivery is still running, and
// that is a transient "not yet", not a failure — so a command waits its turn
// rather than being dropped. The other reasons it refuses — a dead session, or
// no session at all — never clear, and the composer warns the user on *every*
// attempt, so retrying those would be both pointless and a stream of identical
// toasts.
function submitWhenFree(run: Run, text: string): Promise<Delivery> {
  return waitFor<Delivery>(() => {
    if (run.submit(text)) return "sent";
    const live =
      hasInteractivePaneSession(run.terminalId) && !isInteractivePaneSessionDead(run.terminalId);
    return live ? null : "gone";
  }, SUBMIT_FREE_MS).then((result) => result ?? "busy");
}

// Codex has no command form of the switch — only the "/model" picker, a model
// list followed by a reasoning-level list. lpm walks it the way a person would:
// open it, read the rows off the pane, step the cursor onto the row it wants,
// and confirm. Every step is verified against the pane rather than timed, and a
// step that never lands closes the picker and says why instead of leaving a
// half-driven menu on screen.
async function applyCodex(run: Run): Promise<void> {
  const { target, submit } = run;
  // A picker already on screen would swallow the "/model" text and confirm
  // whatever row its cursor sits on, so never type into one.
  if (codexPickerView(run.screen())) {
    toast.error("Close the picker open in this terminal first.");
    return;
  }
  const bannersBefore = codexChangeBanners(run.screen()).length;
  const opened = await submitWhenFree(run, "/model");
  if (opened !== "sent") {
    if (opened === "busy") toast.error("Couldn't reach Codex — the terminal is still busy.");
    return;
  }

  const models = await waitForPicker(run, (v) => v.kind === "model", PICKER_OPEN_MS);
  if (!models) {
    await abort(run, "Couldn't open Codex's model picker — is it mid-turn?");
    return;
  }

  // An effort-only pick still has to walk the model list, so it re-picks the row
  // Codex marks "(current)": the picker always asks for both.
  const modelRow = target.model
    ? findModelRow(models.rows, target.model)
    : (models.rows.find((r) => r.current) ?? null);
  if (!modelRow) {
    await abort(
      run,
      target.model
        ? `Codex's picker doesn't offer ${modelLabel("codex", target.model)} — start it with "codex -m ${target.model}".`
        : "Couldn't tell which model Codex is running.",
    );
    return;
  }
  if (!(await choose(run, models.rows, modelRow))) {
    await abort(run, "Couldn't drive Codex's model picker.");
    return;
  }

  const efforts = await waitForPicker(run, (v) => v.kind === "effort", PICKER_STEP_MS);
  if (!efforts) {
    await abort(run, "Codex didn't ask for a reasoning level.");
    return;
  }

  if (target.effort) {
    if (!(await chooseEffort(run, efforts, target.effort))) return;
  } else if (!(await send(run, ENTER))) {
    // A model-only pick takes the level Codex already highlights, which is that
    // model's own default.
    await abort(run, "Couldn't drive Codex's reasoning-level picker.");
    return;
  }

  // Confirmed by a *new* banner, never by one that was already on screen: an
  // earlier switch in the same session leaves its own behind, and reading that
  // one would call a failed walk a success and leave the picker open.
  const applied = await waitFor(() => {
    const banners = codexChangeBanners(run.screen());
    if (banners.length <= bannersBefore) return null;
    const latest = banners[banners.length - 1];
    if (target.model && latest.model !== target.model) return null;
    if (target.effort && latest.effort !== target.effort) return null;
    return latest;
  }, PICKER_CONFIRM_MS);
  if (!applied) {
    await abort(run, "Codex didn't confirm the switch — check the terminal.");
    return;
  }
  mergeAgentModelPick(run.terminalId, applied);
}

// Pick a reasoning level, descending into Codex's "More reasoning…" row when the
// level lives on its second page (Max and Ultra do).
async function chooseEffort(run: Run, view: PickerView, effort: string): Promise<boolean> {
  let rows = view.rows;
  let row = findEffortRow(rows, effort);
  if (!row) {
    const more = findMoreEffortsRow(rows);
    if (!more || !(await choose(run, rows, more))) {
      await abort(run, "Codex's picker doesn't offer that reasoning level.");
      return false;
    }
    const deeper = await waitForPicker(
      run,
      (v) => findEffortRow(v.rows, effort) !== null,
      PICKER_STEP_MS,
    );
    if (!deeper) {
      await abort(run, "Codex's picker doesn't offer that reasoning level.");
      return false;
    }
    rows = deeper.rows;
    row = findEffortRow(rows, effort);
  }
  if (!row || !(await choose(run, rows, row))) {
    await abort(run, "Couldn't drive Codex's reasoning-level picker.");
    return false;
  }
  return true;
}

/** Walk the cursor onto `target` and confirm it. False when the cursor never
 *  landed, which leaves the picker untouched for the caller to close. */
async function choose(run: Run, rows: PickerRow[], target: PickerRow): Promise<boolean> {
  for (let attempt = 0; attempt < MOVE_ATTEMPTS; attempt++) {
    const live = codexPickerView(run.screen())?.rows ?? rows;
    const keys = moveKeys(live, target);
    if (keys === null) return false;
    if (keys === "") return send(run, ENTER);
    if (!(await send(run, keys))) return false;
    // Matched on the row's name as well as its number: the list underneath can
    // have changed pages between the write and the read, and every page numbers
    // its rows from 1.
    const landed = await waitFor(() => {
      const sel = selectedRow(codexPickerView(run.screen())?.rows ?? []);
      return sel && sel.index === target.index && sel.label === target.label ? true : null;
    }, PICKER_STEP_MS);
    if (landed) return send(run, ENTER);
  }
  return false;
}

// Back out of whatever is on screen — but only while a picker is actually up,
// and only once per picker that an Escape actually dismissed. A stray Escape
// into Codex's composer is its own gesture, so it is never sent blind, and a
// slow redraw is waited out rather than answered with a second one.
async function abort(run: Run, message: string): Promise<void> {
  for (let i = 0; i < 3 && codexPickerView(run.screen()); i++) {
    if (!(await send(run, ESCAPE))) break;
    const closed = await waitFor(
      () => (codexPickerView(run.screen()) === null ? true : null),
      PICKER_CLOSE_MS,
    );
    // A picker that is still up after its Escape settled was a nested page; the
    // next pass backs out of the one behind it.
    if (closed) break;
  }
  toast.error(message);
}

async function send(run: Run, keys: string): Promise<boolean> {
  try {
    await sendTerminalInput(run.terminalId, keys);
    return true;
  } catch {
    return false;
  }
}

function waitForPicker(
  run: Run,
  match: (view: PickerView) => boolean,
  timeout: number,
): Promise<PickerView | null> {
  return waitFor(() => {
    const view = codexPickerView(run.screen());
    return view && match(view) ? view : null;
  }, timeout);
}

async function waitFor<T>(read: () => T | null, timeout: number): Promise<T | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = read();
    if (value !== null) return value;
    if (Date.now() >= deadline) return null;
    await sleep(POLL_MS);
  }
}
