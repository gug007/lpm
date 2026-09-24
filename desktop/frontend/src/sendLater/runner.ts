import { toast } from "sonner";
import { NotifyUnattended } from "../../bridge/commands";
import { interactivePaneOutputAt } from "../components/InteractivePane";
import { buildTerminalPayload } from "../composerPayload";
import { isSwitchingModel } from "../hooks/useAgentModelSwitch";
import { derivePaneStatus } from "../hooks/usePaneStatus";
import { useAppStore } from "../store/app";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { recordMessage } from "../store/messageHistory";
import {
  removePrompt,
  setHold,
  useSendLater,
  type ScheduledPrompt,
} from "../store/sendLater";
import { sendToTerminal, useTerminalTargets, type TerminalTargetInfo } from "../store/terminalTargets";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { enableCloseout } from "./closeout";
import { promptPreview } from "./preview";
import { readiness } from "./readiness";
import { clockLabel } from "./time";

// A prompt the terminal refused (a paste still going in, a session restarting)
// is tried again this soon.
const RETRY_MS = 3_000;

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

function projectTitle(projectName: string): string {
  if (projectName === GLOBAL_TERMINALS_KEY) return "Terminals";
  const project = useAppStore.getState().projects.find((p) => p.name === projectName);
  return project?.label || projectName;
}

function announceSent(item: ScheduledPrompt, target: TerminalTargetInfo) {
  const label = target.label || item.terminalLabel || "the terminal";
  const preview = promptPreview(item.text);
  toast.success(`Sent to ${label}`, {
    description: preview,
    action: {
      label: "Open",
      onClick: () => useAppStore.getState().focusProjectTerminal(item.projectName, target.id),
    },
  });
  void NotifyUnattended(`Sent to ${label} · ${projectTitle(item.projectName)}`, preview).catch(() => {});
}

function announceMissed(items: ScheduledPrompt[], atLaunch: boolean) {
  if (items.length === 0) return;
  const away = atLaunch ? "lpm was closed" : "the Mac was asleep";
  let title: string;
  let description: string;
  if (items.length === 1) {
    const item = items[0];
    title = "A scheduled prompt wasn't sent";
    description = `“${promptPreview(item.text, 60)}” was due at ${clockLabel(item.dueAt)} in ${
      item.terminalLabel || "its terminal"
    } · ${projectTitle(item.projectName)}, while ${away}. It's waiting in that terminal's input.`;
  } else {
    title = `${items.length} scheduled prompts weren't sent`;
    description = `They came due while ${away}. Each one is waiting in its terminal's input.`;
  }
  toast.warning(title, { description, duration: 10_000 });
  void NotifyUnattended(title, description).catch(() => {});
}

// Sends every due prompt into its terminal as soon as the agent there is ready
// for it. Runs in the main window only: that's where terminals take input, and
// a second runner would send everything twice.
export function startSendLaterRunner(): () => void {
  const inFlight = new Set<string>();
  const lastSent = new Map<string, number>();
  const retryAfter = new Map<string, number>();
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

  const deliver = async (item: ScheduledPrompt, target: TerminalTargetInfo) => {
    inFlight.add(item.id);
    setHold(item.id, null);
    try {
      const payload = await buildTerminalPayload(target.id, item.text, item.images);
      const current = useSendLater.getState().items.find((i) => i.id === item.id);
      if (!current || current.state !== "due") return;
      if (!sendToTerminal(item.projectName, target.id, payload)) {
        retryAfter.set(item.id, Date.now() + RETRY_MS);
        return;
      }
      lastSent.set(item.historyKey, Date.now());
      retryAfter.delete(item.id);
      recordMessage({
        text: item.text,
        projectName: item.projectName,
        terminalId: item.historyKey,
        terminalLabel: target.label || item.terminalLabel,
        images: item.images,
      });
      await removePrompt(item.id);
      announceSent(item, target);
    } catch {
      retryAfter.set(item.id, Date.now() + RETRY_MS);
    } finally {
      inFlight.delete(item.id);
      pumpSoon();
    }
  };

  const pump = () => {
    const now = Date.now();
    let soonest = Infinity;
    for (const item of useSendLater.getState().items) {
      if (item.state !== "due" || inFlight.has(item.id)) continue;
      const retry = retryAfter.get(item.id);
      if (retry !== undefined && retry > now) {
        soonest = Math.min(soonest, retry);
        continue;
      }
      const target = findTarget(item);
      if (!target) {
        // Send now for a project not open this session opens it, and the
        // prompt follows once its terminals are back.
        if (item.force) useAppStore.getState().markVisited(item.projectName);
        setHold(item.id, "away");
        continue;
      }
      const outputAt = interactivePaneOutputAt(target.id);
      const verdict = readiness({
        now,
        force: item.force,
        agent: agentStateOf(item.projectName, target.id),
        quietMs: outputAt > 0 ? performance.now() - outputAt : Infinity,
        switchingModel: isSwitchingModel(target.id),
        lastSentAt: lastSent.get(item.historyKey) ?? null,
      });
      if (!verdict.ready) {
        setHold(item.id, verdict.hold);
        if (verdict.retryAt !== null) soonest = Math.min(soonest, verdict.retryAt);
        continue;
      }
      void deliver(item, target);
    }
    arm(soonest);
  };

  const greet = () => {
    if (greeted || !useSendLater.getState().loaded) return;
    greeted = true;
    announceMissed(
      useSendLater.getState().items.filter((i) => i.state === "missed"),
      true,
    );
  };

  const stops = [
    enableCloseout(),
    useSendLater.subscribe((s, prev) => {
      if (s.items === prev.items && s.loaded === prev.loaded) return;
      if (!greeted) greet();
      else {
        const before = new Map(prev.items.map((i) => [i.id, i.state]));
        announceMissed(
          s.items.filter((i) => i.state === "missed" && before.get(i.id) === "scheduled"),
          false,
        );
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
