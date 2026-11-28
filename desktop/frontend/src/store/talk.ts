import { create } from "zustand";
import { CancelAIGenerate, FocusMainWindow, PeerState, TalkPlan as RequestTalkPlan } from "../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../mirror";
import { toast } from "../notifications/toast";
import { peerAliasMap, type PeerClient } from "../peer/usePeerState";
import {
  readTalkReply,
  runTalkPlan,
  TALK_AGENTS,
  talkAgentLabel,
  talkPlanReady,
  talkProjectLabel,
  talkProjects,
  type TalkPlan,
  type TalkProjectOption,
} from "../talk/plan";
import { useAppStore } from "./app";

// The Talk button's panel: one sentence in, a plan to approve, then the run.
type TalkPhase = "closed" | "ask" | "planning" | "plan" | "running" | "failed";

interface TalkState {
  phase: TalkPhase;
  text: string;
  plan: TalkPlan | null;
  candidates: string[];
  // The projects the sentence was matched against, named as the sidebar names
  // them, a paired computer's with that computer's name.
  projects: TalkProjectOption[];
  // The running plan has finished.
  done: boolean;
  failure: { title: string; message: string } | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setText: (text: string) => void;
  submit: (text?: string) => Promise<void>;
  edit: (patch: Partial<TalkPlan>) => void;
  approve: () => Promise<void>;
  askAgain: () => void;
}

const RESTING = {
  phase: "closed" as TalkPhase,
  text: "",
  plan: null,
  candidates: [] as string[],
  projects: [] as TalkProjectOption[],
  done: false,
  failure: null,
};

const DONE_VISIBLE_MS = 900;

let asked = 0;
const genId = (n: number) => `talk-${n}`;

export const useTalkStore = create<TalkState>()((set, get) => ({
  ...RESTING,

  open: () => {
    if (get().phase === "closed") set({ ...RESTING, phase: "ask" });
  },

  close: () => {
    const { phase } = get();
    if (phase === "running") return;
    if (phase === "planning") void CancelAIGenerate(genId(asked)).catch(() => {});
    asked += 1;
    set(RESTING);
  },

  toggle: () => (get().phase === "closed" ? get().open() : get().close()),

  setText: (text) => set({ text }),

  submit: async (spoken) => {
    const text = (spoken ?? get().text).trim();
    if (!text || get().phase !== "ask") return;
    const mine = ++asked;
    set({ phase: "planning", text, failure: null });
    const paired: { peers?: PeerClient[] } | null = await PeerState().catch(() => null);
    if (mine !== asked) return;
    const projects = talkProjects(useAppStore.getState().projects, peerAliasMap(paired?.peers ?? []));
    let reply;
    try {
      reply = readTalkReply(await RequestTalkPlan(text, projects, TALK_AGENTS, genId(mine)));
    } catch (err) {
      reply = readTalkReply({ ok: false, error: String(err) });
    }
    if (mine !== asked || get().phase !== "planning") return;
    if (reply.ok) {
      set({ phase: "plan", plan: reply.plan, candidates: reply.candidates, projects });
      return;
    }
    set({
      phase: "failed",
      failure: {
        title: reply.unsupported ? "I can't do that from here" : "Couldn't make the plan",
        message: reply.error,
      },
    });
  },

  edit: (patch) => {
    const { plan, phase } = get();
    if (plan && phase === "plan") set({ plan: { ...plan, ...patch } });
  },

  approve: async () => {
    const { plan, phase, projects } = get();
    if (!plan || phase !== "plan" || !talkPlanReady(plan)) return;
    set({ phase: "running" });
    let ran: boolean;
    try {
      ran = await runTalkPlan(plan);
    } catch (err) {
      set({ phase: "failed", failure: { title: "Couldn't run the plan", message: String(err) } });
      return;
    }
    if (!ran) {
      set({ phase: "plan" });
      return;
    }
    set({ done: true });
    if (plan.where === "here") {
      toast.success(`Started ${talkAgentLabel(plan.agent)} in ${talkProjectLabel(plan.project, projects)}`);
    }
    setTimeout(() => {
      if (get().phase === "running") set(RESTING);
    }, DONE_VISIBLE_MS);
  },

  askAgain: () => {
    if (get().phase === "failed") set({ ...RESTING, phase: "ask", text: get().text });
  },
}));

// A detached window has no panel of its own, so the main window shows it.
export function toggleTalk(): void {
  if (IS_MIRROR_WINDOW) void FocusMainWindow(undefined, "talk");
  else useTalkStore.getState().toggle();
}
