import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, CornerDownLeft, Folder, GitBranch, Send, Sparkles } from "lucide-react";
import { useTalkStore } from "../../store/talk";
import {
  TALK_AGENTS,
  talkPlanReady,
  talkProjectChoices,
  talkRows,
  talkStepCount,
  type TalkPlace,
  type TalkRowId,
} from "../../talk/plan";
import { BTN_PRIMARY, BTN_QUIET } from "../ui/buttons";
import { FLOATING_CARD } from "../ui/floatingCard";
import { TalkPickMenu } from "./TalkPickMenu";
import { TalkPlanRow, type TalkRowStatus } from "./TalkPlanRow";
import { TALK_LINK } from "./talkStyles";

const PLACE_ICON: Record<TalkPlace, typeof Copy> = { copy: Copy, worktree: GitBranch, here: Folder };

// The plan as three rows, each one changeable, and the one button that runs
// it. Nothing happens before Approve.
export function TalkPlanCard() {
  const plan = useTalkStore((s) => s.plan);
  const candidates = useTalkStore((s) => s.candidates);
  const projects = useTalkStore((s) => s.projects);
  const phase = useTalkStore((s) => s.phase);
  const done = useTalkStore((s) => s.done);
  const { edit, approve, close } = useTalkStore.getState();
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const running = phase === "running";

  // Return and Escape are the card's only while focus is in it. It takes focus
  // when the field that held it has just gone (the sentence's as the card
  // appears, the prompt's as its editing ends), never from somewhere else.
  useEffect(() => {
    const held = document.activeElement;
    if (!editing && (!held || held === document.body)) cardRef.current?.focus();
  }, [editing]);

  if (!plan) return null;

  const statusOf = (id: TalkRowId): TalkRowStatus =>
    done ? "done" : running && id === "project" ? "running" : "idle";
  const PlaceIcon = PLACE_ICON[plan.where];
  const icons: Record<TalkRowId, ReactNode> = {
    project: <PlaceIcon size={14} />,
    agent: <Sparkles size={14} className={plan.agent === "claude" ? "text-[var(--accent-claude)]" : undefined} />,
    prompt: <Send size={14} />,
  };
  const pick = (patch: { project: string } | { agent: string }) => {
    edit(patch);
    cardRef.current?.focus();
  };

  const actions: Record<TalkRowId, ReactNode> = {
    project: (
      <TalkPickMenu
        ariaLabel="Change the project"
        picks={talkProjectChoices(projects, candidates).map((p) => ({ id: p.name, label: p.label }))}
        picked={plan.project}
        onPick={(project) => pick({ project })}
      />
    ),
    agent: (
      <TalkPickMenu
        ariaLabel="Change the agent"
        picks={TALK_AGENTS}
        picked={plan.agent}
        onPick={(agent) => pick({ agent })}
      />
    ),
    prompt: (
      <button type="button" onClick={() => setEditing((on) => !on)} className={TALK_LINK}>
        {editing ? "Done" : "Edit"}
      </button>
    ),
  };

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
          if (editing) setEditing(false);
          else close();
        } else if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          void approve();
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <h2 id="talk-plan-title" className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
          {running ? "Running the plan" : "Run this plan?"}
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">{`${talkStepCount(plan)} steps`}</span>
      </div>
      <ol className="flex flex-col">
        {talkRows(plan, projects).map((row, i, rows) => (
          <TalkPlanRow
            key={row.id}
            row={row}
            icon={icons[row.id]}
            status={statusOf(row.id)}
            last={i === rows.length - 1}
            action={running ? undefined : actions[row.id]}
            editor={
              row.id === "prompt" && editing && !running ? (
                <textarea
                  value={plan.prompt}
                  onChange={(e) => edit({ prompt: e.target.value })}
                  rows={3}
                  autoFocus
                  aria-label="Prompt"
                  className="min-w-0 flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none"
                />
              ) : undefined
            }
          />
        ))}
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
