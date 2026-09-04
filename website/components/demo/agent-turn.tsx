"use client";

import { Fragment, type ReactNode } from "react";
import { BRAND, type AgentKind, type AgentStep as Step } from "./agent-script";
import { claudeTool, codexTool, splitVerb, type CodexTool } from "./agent-tools";

type TurnProps = {
  query: string;
  steps: Step[];
  revealed: number;
  finished: boolean;
  footer?: ReactNode;
};

export function AgentTurn(props: TurnProps & { agent: AgentKind }) {
  const { agent, ...turn } = props;
  return agent === "claude" ? <ClaudeTurn {...turn} /> : <CodexTurn {...turn} />;
}

// Claude Code: a highlighted `❯` band for the prompt, a green `⏺` per tool with
// its `⎿` result underneath, and a white `⏺` for anything the model says.
function ClaudeTurn({ query, steps, revealed, footer }: TurnProps) {
  return (
    <div className="mb-3">
      <div className="-mx-3 flex gap-[1ch] bg-[rgba(255,255,255,0.06)] px-3 py-0.5">
        <span className="text-[#919191]">{BRAND.claude.prompt}</span>
        <span className="whitespace-pre-wrap break-words text-[#e5e5e5]">{query}</span>
      </div>
      <div className="mt-1 space-y-1">
        {steps.slice(0, revealed).map((step, i) => {
          if (step.kind === "thinking") return null;
          if (step.kind === "text") {
            // Scripts use an empty line as a paragraph break; the spacing
            // between steps already covers it, and neither CLI prints a bullet
            // with nothing after it.
            if (!step.text.trim()) return null;
            return (
              <div key={i} className="flex gap-[1ch]">
                <span className={step.style === "muted" ? "text-[#8a8a8a]" : "text-[#cccccc]"}>
                  {BRAND.claude.bullet}
                </span>
                <span
                  className={`whitespace-pre-wrap break-words ${
                    step.style === "muted" ? "text-[#8a8a8a]" : "text-[#cccccc]"
                  }`}
                >
                  {step.text}
                </span>
              </div>
            );
          }
          const tool = claudeTool(step);
          return (
            <div key={i}>
              <div className="flex gap-[1ch]">
                <span className="text-[#5ffa68]">{BRAND.claude.bullet}</span>
                <span className="break-all">
                  <span className="font-semibold text-[#cccccc]">{tool.name}</span>
                  <span className="text-[#919191]">({tool.arg})</span>
                </span>
              </div>
              <div className="flex gap-[2ch] pl-[2ch] text-[#8a8a8a]">
                <span>⎿</span>
                <span className="break-words">{emphasize(tool.result)}</span>
              </div>
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}

// Codex: a dim `›` prompt, `•` section bullets, consecutive read-only tools
// folded into one `Explored` block, and the closing answer set between rules.
function CodexTurn({ query, steps, revealed, finished, footer }: TurnProps) {
  const visible = steps.slice(0, revealed);
  const blocks: ReactNode[] = [];
  const closing = finished ? closingRange(steps) : null;
  let explored: string[] = [];

  const flush = (key: string) => {
    if (explored.length === 0) return;
    const lines = explored;
    explored = [];
    blocks.push(
      <div key={key}>
        <div className="flex gap-[1ch]">
          <span className="text-[#8a8a8a]">{BRAND.codex.bullet}</span>
          <span className="font-semibold text-[#cccccc]">Explored</span>
        </div>
        {lines.map((detail, i) => {
          const [verb, target] = splitVerb(detail);
          return (
            <div key={i} className="flex gap-[1ch] pl-[2ch]">
              <span className="w-[1ch] shrink-0 text-[#8a8a8a]">{i === 0 ? "└" : ""}</span>
              <span className="break-all">
                <span className="text-[#00c5c7]">{verb}</span>{" "}
                <span className="text-[#c7c7c7]">{target}</span>
              </span>
            </div>
          );
        })}
      </div>,
    );
  };

  visible.forEach((step, i) => {
    if (step.kind === "thinking") return;
    if (step.kind === "text") {
      if (!step.text.trim()) return;
      flush(`e${i}`);
      blocks.push(
        <Fragment key={i}>
          {closing?.start === i && <Rule />}
          <div className="flex gap-[1ch]">
            <span className="text-[#8a8a8a]">{BRAND.codex.bullet}</span>
            <span
              className={`whitespace-pre-wrap break-words ${
                step.style === "muted" ? "text-[#8a8a8a]" : "text-[#cccccc]"
              }`}
            >
              {step.text}
            </span>
          </div>
          {closing?.end === i && <Rule />}
        </Fragment>,
      );
      return;
    }
    const tool: CodexTool = codexTool(step);
    if (tool.kind === "explored") {
      explored.push(tool.detail);
      return;
    }
    flush(`e${i}`);
    if (tool.kind === "edited") {
      const [verb, target] = splitVerb(tool.head);
      blocks.push(
        <div key={i} className="flex gap-[1ch]">
          <span className="text-[#8a8a8a]">{BRAND.codex.bullet}</span>
          <span className="break-all">
            <span className="font-semibold text-[#cccccc]">{verb}</span>{" "}
            <span className="text-[#c7c7c7]">{target}</span>
            {tool.tag && <span className="ml-1 text-[#8a8a8a]">({tool.tag})</span>}
          </span>
        </div>,
      );
      return;
    }
    blocks.push(
      <div key={i}>
        <div className="flex gap-[1ch]">
          <span className="text-[#8a8a8a]">{BRAND.codex.bullet}</span>
          <span className="break-all">
            <span className="font-semibold text-[#cccccc]">Ran</span>{" "}
            <span className="text-[#c7c7c7]">{tool.head}</span>
          </span>
        </div>
        <div className="flex gap-[1ch] pl-[2ch] text-[#8a8a8a]">
          <span className="text-[#8a8a8a]">└</span>
          <span className="break-words">{tool.detail}</span>
        </div>
      </div>,
    );
  });
  flush("explored-tail");

  return (
    <div className="mb-3">
      <div className="flex gap-[1ch]">
        <span className="font-bold text-[#8a8a8a]">{BRAND.codex.prompt}</span>
        <span className="whitespace-pre-wrap break-words text-[#cccccc]">{query}</span>
      </div>
      <div className="mt-1 space-y-1">
        {blocks}
        {footer}
      </div>
    </div>
  );
}

function Rule() {
  return <div className="-mx-3 border-t border-[#2e2e2e]" />;
}

// Codex sets a landed turn's closing message between two rules. The message can
// span several steps, so bracket the whole trailing run of them rather than only
// the last line.
function closingRange(steps: Step[]): { start: number; end: number } | null {
  const spoken = (step: Step) => step.kind === "text" && step.text.trim() !== "";
  let end = steps.length - 1;
  while (end >= 0 && steps[end].kind === "text" && !spoken(steps[end])) end--;
  if (end < 0 || !spoken(steps[end])) return null;
  let start = end;
  while (start > 0 && spoken(steps[start - 1])) start--;
  return { start, end };
}

// Claude Code bolds the counts inside a `⎿` result line.
function emphasize(result: string): ReactNode {
  return result.split(/(\d[\d,]*(?:\.\d+)?)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-semibold text-[#c7c7c7]">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
