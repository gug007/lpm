import { useEffect, useRef, type ReactNode } from "react";
import { Copy, CornerDownLeft, Folder, GitBranch, Send, Sparkles } from "lucide-react";
import { useTalkStore } from "../../store/talk";
import {
  TALK_AGENTS,
  TALK_PLACES,
  WHICH_PROJECT,
  talkAgentLabel,
  talkPlaceLabel,
  talkPlanReady,
  talkProjectChoices,
  talkProjectLabel,
  type TalkPlace,
} from "../../talk/plan";
import { BTN_PRIMARY, BTN_QUIET } from "../ui/buttons";
import { FLOATING_CARD } from "../ui/floatingCard";
import { TalkCardHeader } from "./TalkCardHeader";
import { TalkHeard } from "./TalkHeard";
import { TalkPickMenu } from "./TalkPickMenu";
import { TalkPlanRow, type TalkRowStatus } from "./TalkPlanRow";
import { TalkPromptField } from "./TalkPromptField";
import { TALK_TITLE_MENU, TALK_VALUE_MENU } from "./talkStyles";

const PLACE_ICON: Record<TalkPlace, typeof Copy> = { copy: Copy, worktree: GitBranch, here: Folder };
const PLACE_PICKS = TALK_PLACES.map((p) => ({ id: p.id, label: p.choice }));

// The plan as three rows, every part of it changeable where it stands, and the
// one button that runs it. Nothing happens before Approve.
export function TalkPlanCard() {
  const plan = useTalkStore((s) => s.plan);
  const candidates = useTalkStore((s) => s.candidates);
  const projects = useTalkStore((s) => s.projects);
  const phase = useTalkStore((s) => s.phase);
  const done = useTalkStore((s) => s.done);
  const { edit, approve, close } = useTalkStore.getState();
  const cardRef = useRef<HTMLElement>(null);
  const running = phase === "running";

  // Return and Escape are the card's only while focus is in it. It takes focus
  // as it appears, when the sentence's field that held it has just gone.
  useEffect(() => {
    const held = document.activeElement;
    if (!held || held === document.body) cardRef.current?.focus();
  }, []);

  if (!plan) return null;

  const statusOf = (row: "project" | "agent" | "prompt"): TalkRowStatus =>
    done ? "done" : running && row === "project" ? "running" : "idle";
  const PlaceIcon = PLACE_ICON[plan.where];
  const pick = (patch: { project: string } | { agent: string } | { where: TalkPlace }) => {
    edit(patch);
    cardRef.current?.focus();
  };
  const projectText = plan.project ? talkProjectLabel(plan.project, projects) : WHICH_PROJECT;
  const shown = (text: ReactNode) => (
    <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">{text}</span>
  );

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby="talk-plan-title"
      className={`${FLOATING_CARD} outline-none`}
      onKeyDown={(e) => {
        if (running) return;
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        } else if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          void approve();
        }
      }}
    >
      <TalkCardHeader
        id="talk-plan-title"
        tile="rest"
        title={running ? "Running the plan" : "Run this plan?"}
        subtitle={running ? "Starting it now" : "Change anything before it runs"}
      />
      <TalkHeard fixed={running} />
      <ol className="flex flex-col">
        <TalkPlanRow
          icon={<PlaceIcon size={14} />}
          status={statusOf("project")}
          last={false}
          title={
            running ? (
              talkPlaceLabel(plan.where)
            ) : (
              <TalkPickMenu
                ariaLabel="Change where it runs"
                picks={PLACE_PICKS}
                picked={plan.where}
                onPick={(where) => pick({ where: where as TalkPlace })}
                className={TALK_TITLE_MENU}
              >
                {talkPlaceLabel(plan.where)}
              </TalkPickMenu>
            )
          }
        >
          {running ? (
            shown(projectText)
          ) : (
            <TalkPickMenu
              ariaLabel="Change the project"
              picks={talkProjectChoices(projects, candidates).map((p) => ({ id: p.name, label: p.label }))}
              picked={plan.project}
              onPick={(project) => pick({ project })}
              className={TALK_VALUE_MENU}
            >
              <span className={`truncate ${plan.project ? "" : "text-[var(--accent-amber-text)]"}`}>{projectText}</span>
            </TalkPickMenu>
          )}
        </TalkPlanRow>
        <TalkPlanRow
          icon={<Sparkles size={14} className={plan.agent === "claude" ? "text-[var(--accent-claude)]" : undefined} />}
          status={statusOf("agent")}
          last={false}
          title="Start"
        >
          {running ? (
            shown(talkAgentLabel(plan.agent))
          ) : (
            <TalkPickMenu
              ariaLabel="Change the agent"
              picks={TALK_AGENTS}
              picked={plan.agent}
              onPick={(agent) => pick({ agent })}
              className={TALK_VALUE_MENU}
            >
              <span className="truncate">{talkAgentLabel(plan.agent)}</span>
            </TalkPickMenu>
          )}
        </TalkPlanRow>
        <TalkPlanRow icon={<Send size={14} />} status={statusOf("prompt")} last title="Send">
          {running ? (
            <p className="min-w-0 whitespace-pre-wrap break-words py-1 text-[13px] font-medium leading-[18px] text-[var(--text-primary)]">
              {plan.prompt}
            </p>
          ) : (
            <TalkPromptField
              value={plan.prompt}
              onChange={(prompt) => edit({ prompt })}
              onSubmit={() => void approve()}
            />
          )}
        </TalkPlanRow>
      </ol>
      {!running && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-[1_1_200px] text-[11px] text-[var(--text-muted)]">
            Nothing runs until you approve
          </span>
          <button type="button" onClick={close} className={BTN_QUIET}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!talkPlanReady(plan)}
            onClick={() => void approve()}
            className={`${BTN_PRIMARY} flex items-center gap-2`}
            title="Return"
          >
            Approve
            <CornerDownLeft size={12} aria-hidden className="opacity-60" />
          </button>
        </div>
      )}
    </section>
  );
}
