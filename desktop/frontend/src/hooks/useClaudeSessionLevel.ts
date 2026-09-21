import { useEffect } from "react";
import { ClaudeSessionState } from "../../bridge/commands";
import { claudeModelValue, claudeUltracodeMark } from "../claudeReadback";
import type { AgentSessionRef } from "../agentSession";
import {
  captureInteractivePaneLog,
  interactivePaneOutputAt,
} from "../components/InteractivePane";
import {
  agentModelEffortAt,
  agentModelPick,
  mergeAgentModelPick,
  setAgentModelPick,
} from "../store/agentModelPicks";

// How often Claude's transcript is consulted for the level the session stands
// at. Everything the pane can say about the level is an event — a banner at
// startup, a line when it changes, a chip that fades — so an hour into a session
// nobody re-levelled through lpm, the pane says nothing at all and this is the
// only source left. It is also always the older of the two, so it runs on a lazy
// cadence and only after the pane has printed something new.
const POLL_MS = 10000;

/** Keep a Claude terminal's model and level current from the session's own
 *  transcript, which records both on every turn. Inert for anything else — a
 *  Codex tab keeps its status line, and a peer or SSH project has no transcript
 *  on this Mac. */
export function useClaudeSessionLevel({
  terminalId,
  projectName,
  session,
}: {
  terminalId: string;
  projectName: string;
  session: AgentSessionRef | null;
}) {
  const sessionId = session?.provider === "claude" ? session.sessionId : "";
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let inFlight = false;
    let seen = -1;
    const read = async () => {
      const at = interactivePaneOutputAt(terminalId);
      // The transcript only grows when the agent writes, which the pane prints.
      if (inFlight || at === seen) return;
      inFlight = true;
      try {
        const state = await ClaudeSessionState(projectName, sessionId);
        if (cancelled) return;
        seen = at;
        if (!state?.effort && !state?.model) return;
        const model = claudeModelValue(state.model) || agentModelPick(terminalId).model;
        const when = state.at ?? 0;
        // A record older than what lpm already knows still names the model,
        // which nothing else contradicts.
        if (!state.effort || when <= agentModelEffortAt(terminalId)) {
          mergeAgentModelPick(terminalId, { model });
          return;
        }
        // Ultracode is recorded as the level it runs at, so a transcript saying
        // "xhigh" is not evidence that the session left ultracode — the label on
        // the pane's composer is.
        const ultra = claudeUltracodeMark(captureInteractivePaneLog(terminalId, 0));
        setAgentModelPick(
          terminalId,
          { model, effort: ultra && state.effort === "xhigh" ? "ultracode" : state.effort },
          when,
        );
      } catch {
        // A transcript that can't be read — a pinned account whose directory
        // moved, a session started before lpm knew its id — leaves the pane as
        // the only source, which is where this started.
        seen = at;
      } finally {
        inFlight = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectName, sessionId, terminalId]);
}
