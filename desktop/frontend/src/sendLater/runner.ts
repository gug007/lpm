import { TerminalForegroundCommand } from "../../bridge/commands";
import { interactivePaneOutputAt } from "../components/InteractivePane";
import { buildTerminalPayload } from "../composerPayload";
import { isSwitchingModel } from "../hooks/useAgentModelSwitch";
import { derivePaneStatus } from "../hooks/usePaneStatus";
import { useAppStore } from "../store/app";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { recordMessage } from "../store/messageHistory";
import { removePrompt, setHold, useSendLater, type ScheduledPrompt } from "../store/sendLater";
import { sendToTerminal, useTerminalTargets, type TerminalTargetInfo } from "../store/terminalTargets";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { announceMissed, announceSent } from "./announce";
import { enableCloseout } from "./closeout";
import { foregroundKind, readiness } from "./readiness";
import { createClosedTabReconciler } from "./reconcile";

// A terminal that refuses a prompt (a paste still going in, a session that
// ended) is tried again after this, doubling each time up to the cap.
const RETRY_MS = 3_000;
const RETRY_CAP_MS = 5 * 60_000;
// After this many refusals in a row the prompt shows as waiting on its terminal.
const AWAY_AFTER_FAILURES = 3;

function findTarget(item: ScheduledPrompt): TerminalTargetInfo | null {
  const targets = useTerminalTargets.getState().byProject[item.projectName];
  return targets?.find((t) => t.historyKey === item.historyKey) ?? null;
}

function agentStateOf(projectName: string, terminalId: string) {
  const entries =
    projectName === GLOBAL_TERMINALS_KEY
      ? useGlobalAgentStatus.getState().entries
      : useAppStore.getState().projects.find((p) => p.name === projectName)?.statusEntries;
  return derivePaneStatus(entries, Date.now()).agents.get(terminalId)?.state;
}

function current(id: string): ScheduledPrompt | undefined {
  return useSendLater.getState().items.find((i) => i.id === id);
}

// Sends every due prompt into its terminal as soon as that terminal is ready for
// it. Runs in the main window only: that's where terminals take input, and a
// second runner would send everything twice.
export function startSendLaterRunner(): () => void {
  const inFlight = new Set<string>();
  const busyTerminals = new Set<string>();
  // Typed in already, waiting for the schedule to drop them: never typed again.
  const sent = new Set<string>();
  const lastSent = new Map<string, number>();
  const retryAfter = new Map<string, number>();
  const failures = new Map<string, number>();
  const reconcile = createClosedTabReconciler();
  let timer: number | null = null;
  let queued = false;
  let greeted = false;

  const arm = (at: number) => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (!Number.isFinite(at)) return;
    timer = window.setTimeout(() => {
      timer = null;
      pump();
    }, Math.max(250, at - Date.now()));
  };

  const pumpSoon = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      pump();
    });
  };

  const refused = (id: string) => {
    const n = (failures.get(id) ?? 0) + 1;
    failures.set(id, n);
    retryAfter.set(id, Date.now() + Math.min(RETRY_MS * 2 ** (n - 1), RETRY_CAP_MS));
    if (n >= AWAY_AFTER_FAILURES) setHold(id, "away");
  };

  const dropSent = (id: string) => {
    removePrompt(id).catch(() => window.setTimeout(() => void removePrompt(id).catch(() => {}), 5_000));
  };

  const attempt = async (item: ScheduledPrompt, target: TerminalTargetInfo) => {
    inFlight.add(item.id);
    busyTerminals.add(item.historyKey);
    try {
      const foreground = foregroundKind(await TerminalForegroundCommand(target.id).catch(() => ""));
      const due = current(item.id);
      if (!due || due.state !== "due") return;
      const outputAt = interactivePaneOutputAt(target.id);
      const verdict = readiness({
        now: Date.now(),
        force: due.force,
        forAgent: due.agent !== "",
        foreground,
        agent: agentStateOf(due.projectName, target.id),
        quietMs: outputAt > 0 ? performance.now() - outputAt : Infinity,
        switchingModel: isSwitchingModel(target.id),
        lastSentAt: lastSent.get(due.historyKey) ?? null,
      });
      if (!verdict.ready) {
        setHold(due.id, verdict.hold);
        if (verdict.retryAt !== null) retryAfter.set(due.id, verdict.retryAt);
        return;
      }
      const payload = await buildTerminalPayload(target.id, due.text, due.images);
      const still = current(item.id);
      if (!still || still.state !== "due") return;
      if (!sendToTerminal(still.projectName, target.id, payload)) {
        refused(still.id);
        return;
      }
      sent.add(still.id);
      failures.delete(still.id);
      setHold(still.id, null);
      lastSent.set(still.historyKey, Date.now());
      recordMessage({
        text: still.text,
        projectName: still.projectName,
        terminalId: still.historyKey,
        terminalLabel: target.label || still.terminalLabel,
        images: still.images,
      });
      announceSent(still, target);
      dropSent(still.id);
    } catch {
      refused(item.id);
    } finally {
      inFlight.delete(item.id);
      busyTerminals.delete(item.historyKey);
      pumpSoon();
    }
  };

  const pump = () => {
    const { items, sender } = useSendLater.getState();
    if (!sender) return arm(Infinity);
    const now = Date.now();
    const live = new Set(items.map((i) => i.id));
    for (const id of sent) if (!live.has(id)) sent.delete(id);
    let soonest = reconcile(items, now);
    for (const item of items) {
      if (item.state !== "due" || sent.has(item.id) || inFlight.has(item.id)) continue;
      if (busyTerminals.has(item.historyKey)) continue;
      const retry = retryAfter.get(item.id);
      if (retry !== undefined && retry > now) {
        soonest = Math.min(soonest, retry);
        continue;
      }
      retryAfter.delete(item.id);
      const target = findTarget(item);
      if (!target) {
        // Send now for a project not open this session opens it in the
        // background; the prompt follows once its terminal is back and ready.
        if (item.force && item.projectName !== GLOBAL_TERMINALS_KEY) {
          useAppStore.getState().markVisited(item.projectName);
        }
        setHold(item.id, "away");
        continue;
      }
      busyTerminals.add(item.historyKey);
      void attempt(item, target);
    }
    arm(soonest);
  };

  const greet = () => {
    if (greeted || !useSendLater.getState().loaded) return;
    greeted = true;
    announceMissed(useSendLater.getState().items, true);
  };

  const stops = [
    enableCloseout(),
    useSendLater.subscribe((s, prev) => {
      if (s.items === prev.items && s.loaded === prev.loaded && s.sender === prev.sender) return;
      if (!greeted) greet();
      else if (s.items.some((i) => i.state === "missed" && prev.items.find((p) => p.id === i.id)?.state === "scheduled")) {
        announceMissed(s.items, false);
      }
      pumpSoon();
    }),
    useAppStore.subscribe((s, prev) => {
      if (s.projects !== prev.projects) pumpSoon();
    }),
    useGlobalAgentStatus.subscribe((s, prev) => {
      if (s.entries !== prev.entries) pumpSoon();
    }),
    useTerminalTargets.subscribe((s, prev) => {
      if (s.byProject !== prev.byProject) pumpSoon();
    }),
  ];
  greet();
  pumpSoon();

  return () => {
    stops.forEach((stop) => stop());
    if (timer !== null) window.clearTimeout(timer);
  };
}
