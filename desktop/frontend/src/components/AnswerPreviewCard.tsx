import type { ReactNode } from "react";
import type { AnswerKind } from "../answerKind";
import type { AICLI } from "../types";
import { AnswerKindIcon } from "./AnswerKindIcon";
import { AgentGlyph } from "./terminal/AgentGlyph";

interface AnswerPreviewCardProps {
  kind: AnswerKind;
  // The agent the answer would come from, whose mark heads its reply.
  agent: AICLI | null;
  // A prompt as it would be typed, and the agent's reply to it.
  question: string;
  reply: ReactNode;
  title: string;
  about: string;
  on: boolean;
  // Anything after the description, such as a lesson link.
  extra?: ReactNode;
  // The band that ends the card, edge to edge.
  foot: ReactNode;
}

// An answer tool's hover card: a prompt and the reply it gets, so the button
// explains itself by example, then what it does and what makes it. It pads
// itself, so the foot can end it as a band from edge to edge.
export function AnswerPreviewCard({ kind, agent, question, reply, title, about, on, extra, foot }: AnswerPreviewCardProps) {
  return (
    <div className="w-[318px]">
      <div className="flex flex-col gap-3 px-3.5 pb-3 pt-3.5">
        <div className="max-w-[82%] self-end rounded-[14px_14px_4px_14px] bg-[var(--bg-active)] px-[11px] py-[7px] text-[12.5px] leading-[1.35] text-[var(--text-primary)]">
          {question}
        </div>
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--bg-active)]"
          >
            {agent ? <AgentGlyph agent={agent} size={11} /> : <AnswerKindIcon kind={kind} size={11} />}
          </span>
          {reply}
        </div>
        <div className="flex flex-col gap-[3px] pt-0.5">
          <div className="flex items-center gap-[7px]">
            <span className="text-[13.5px] font-semibold leading-normal text-[var(--text-primary)]">{title}</span>
            {on && (
              <span className="flex h-[18px] items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent-violet)_18%,transparent)] px-[7px] text-[10.5px] font-semibold leading-none text-[var(--accent-violet-text)]">
                <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-[var(--accent-violet)]" />
                On
              </span>
            )}
          </div>
          <span className="text-[12.5px] leading-[1.45] text-[var(--text-secondary)]">{about}</span>
          {on && (
            <span className="text-[12px] leading-[1.4] text-[var(--text-muted)]">
              Click the button again for a text answer.
            </span>
          )}
          {extra}
        </div>
      </div>
      {foot}
    </div>
  );
}
