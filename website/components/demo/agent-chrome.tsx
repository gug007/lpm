"use client";

import { useEffect, useState } from "react";
import { BRAND, CLAUDE_STARS, settledVerb, workingVerb, type AgentKind } from "./agent-script";
import { useReducedMotion } from "./ui";

// The fixed furniture each CLI paints around a session: its launch banner and
// its bottom status line. Everything here mirrors the real binaries.

export function AgentBanner({ agent, cwd }: { agent: AgentKind; cwd: string }) {
  return agent === "claude" ? <ClaudeBanner cwd={cwd} /> : <CodexBanner cwd={cwd} />;
}

// leading-none fuses the logo's block glyphs into one mark the way a terminal
// cell grid does, and keeps its three rows on the same baselines as the three
// lines of text beside it.
function ClaudeBanner({ cwd }: { cwd: string }) {
  const b = BRAND.claude;
  return (
    <div className="flex gap-3 leading-none">
      <div className={`whitespace-pre ${b.color}`}>
        {" ▐▛███▜▌\n▝▜█████▛▘\n  ▘▘ ▝▝"}
      </div>
      <div className="space-y-[2px]">
        <div>
          <span className="font-semibold text-[#cccccc]">{b.name}</span>{" "}
          <span className="text-[#686868]">{b.version}</span>
        </div>
        <div className="text-[#919191]">
          {b.model} · {b.account}
        </div>
        <div className="text-[#919191]">{cwd}</div>
      </div>
    </div>
  );
}

function CodexBanner({ cwd }: { cwd: string }) {
  const b = BRAND.codex;
  return (
    <div className="inline-block rounded-md border border-[#2e2e2e] px-2.5 py-1.5">
      <div>
        <span className="text-[#686868]">&gt;_</span>{" "}
        <span className="font-semibold text-[#cccccc]">OpenAI Codex</span>{" "}
        <span className="text-[#686868]">({b.version})</span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3">
        <span className="text-[#686868]">model:</span>
        <span className="text-[#c7c7c7]">
          {b.model}
          <span className="ml-3 text-[#00c5c7]">/model</span>
          <span className="text-[#686868]"> to change</span>
        </span>
        <span className="text-[#686868]">directory:</span>
        <span className="text-[#c7c7c7]">{cwd}</span>
      </div>
    </div>
  );
}

/** The line each CLI holds while a turn is in flight. */
export function WorkingLine(props: {
  agent: AgentKind;
  seed: number;
  startedAt: number;
  tokens: number;
}) {
  const { agent, ...rest } = props;
  return agent === "claude" ? (
    <ClaudeWorkingLine {...rest} />
  ) : (
    <CodexWorkingLine startedAt={rest.startedAt} />
  );
}

function ClaudeWorkingLine({
  seed,
  startedAt,
  tokens,
}: {
  seed: number;
  startedAt: number;
  tokens: number;
}) {
  const elapsed = useElapsed(startedAt);
  const star = useStar();
  return (
    <div className="text-[#686868]">
      <span className={`inline-block w-3 ${BRAND.claude.color}`}>{star}</span>
      <span className="ml-1 text-[#e5e5e5]">{workingVerb(seed)}…</span>
      <span className="ml-1.5">
        ({elapsed}s · ↓ {formatTokens(tokens)} tokens · esc to interrupt)
      </span>
    </div>
  );
}

function CodexWorkingLine({ startedAt }: { startedAt: number }) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className="text-[#686868]">
      <span>{BRAND.codex.bullet}</span>
      <span className="ml-1.5 text-[#e5e5e5]">Working</span>
      <span className="ml-1.5">({elapsed}s • esc to interrupt)</span>
    </div>
  );
}

/** Claude Code closes a landed turn with `✻ Cogitated for 9s`. */
export function TurnFooter({ seed, seconds }: { seed: number; seconds: number }) {
  return (
    <div className="mt-1 text-[#686868]">
      <span className="inline-block w-3">✻</span>
      <span className="ml-1">
        {settledVerb(seed)} for {seconds}s
      </span>
    </div>
  );
}

export function AgentStatusLine({
  agent,
  project,
  work,
}: {
  agent: AgentKind;
  project: string;
  work: number;
}) {
  const dot = <span className="text-[#686868]"> · </span>;

  if (agent === "codex") {
    const context = Math.max(41, 100 - work * 2);
    return (
      <div className="shrink-0 px-3 pb-1.5 font-mono text-[12px] text-[#919191]">
        <span className="text-[#f6e2b7]">{BRAND.codex.model}</span>
        {dot}
        <span className="text-[#f2b590]">Context {context}% left</span>
        {dot}
        <span className="text-[#e990a9]">weekly 99% left</span>
        {dot}
        <span className="text-[#c8a9ee]">Fast off</span>
      </div>
    );
  }

  const context = Math.max(38, 92 - work * 2);
  const cost = (0.01 + work * 0.008).toFixed(2);
  return (
    <div className="shrink-0 px-3 pb-1.5 font-mono text-[12px] text-[#919191]">
      <span>{project}</span>
      {dot}
      <span className="text-[#d78787]">{BRAND.claude.model}</span>
      {dot}
      <span className="text-[#686868]">ctx </span>
      <span>{context}%</span>
      {dot}
      <span className="text-[#c7c400]">${cost}</span>
    </div>
  );
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

function useStar(): string {
  const [i, setI] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % CLAUDE_STARS.length), 120);
    return () => window.clearInterval(id);
  }, [reducedMotion]);
  return reducedMotion ? CLAUDE_STARS[3] : CLAUDE_STARS[i];
}
