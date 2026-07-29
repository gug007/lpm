import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AgentSessionTitle } from "../../../bridge/commands";
import { agentSessionOf, type AgentSessionRef } from "../../agentSession";
import {
  collectPanes,
  collectTerminals,
  followsAgentTitle,
  isTerminalTab,
  mapPane,
  terminalDisplayLabel,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { disambiguateLabelAgainst } from "../../terminalLabels";
import { IS_MIRROR_WINDOW } from "../../mirror";

// A tab whose agent hasn't published a title yet (opened but never prompted)
// would otherwise re-read every transcript on the fast cadence forever, so the
// pending cadence decays. Any title landing resets it, keeping a freshly
// started session quick to name.
const PENDING_TITLE_POLL_MS = [2000, 5000, 15000, 60000];
const RESOLVED_TITLE_POLL_MS = 15000;
const MAX_LOOKUP_ERRORS = 3;

interface Candidate {
  tab: TerminalInstance;
  session: AgentSessionRef;
}

// Per-project hook instance, so the tab plus its session identifies a lookup.
function lookupKey({ tab, session }: Candidate) {
  return [tab.id, session.provider, session.sessionId].join(":");
}

function titleResolved(tab: TerminalInstance, session: AgentSessionRef) {
  return (
    !!tab.sessionTitle &&
    tab.sessionTitleId === session.sessionId &&
    tab.sessionTitleSource === "vendor"
  );
}

export function sessionTitlePollKey(tree: PaneNode | null): string {
  if (!tree) return "";
  return collectTerminals(tree)
    .filter(isTerminalTab)
    .map((tab) => {
      const session = agentSessionOf(tab);
      return session
        ? `${tab.id}:${session.provider}:${session.sessionId}:${!followsAgentTitle(tab)}`
        : "";
    })
    .filter(Boolean)
    .join("|");
}

export function useAgentSessionTitles({
  projectName,
  tree,
  treeRef,
  applyTree,
  enabled = true,
}: {
  projectName: string;
  tree: PaneNode | null;
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  enabled?: boolean;
}) {
  const errorCountsRef = useRef(new Map<string, number>());
  // The host re-renders on every streamed log line; the key only moves when the
  // tree does, so it must not re-parse every tab's resume command per render.
  const pollKey = useMemo(() => sessionTitlePollKey(tree), [tree]);

  useEffect(() => {
    if (IS_MIRROR_WINDOW || !enabled || !pollKey) return;
    let cancelled = false;
    let pendingRounds = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Tabs still worth a lookup: an agent session, not manually named, and not
    // already given up on.
    const collectCandidates = (tree: PaneNode): Candidate[] => {
      const out: Candidate[] = [];
      for (const tab of collectTerminals(tree)) {
        if (!isTerminalTab(tab) || !followsAgentTitle(tab)) continue;
        const session = agentSessionOf(tab);
        if (!session) continue;
        const candidate = { tab, session };
        if (
          (errorCountsRef.current.get(lookupKey(candidate)) ?? 0) <
          MAX_LOOKUP_ERRORS
        ) {
          out.push(candidate);
        }
      }
      return out;
    };

    const schedule = (candidates: Candidate[]) => {
      if (cancelled || candidates.length === 0) return;
      const pending = candidates.some(
        ({ tab, session }) => !titleResolved(tab, session),
      );
      const delay = pending
        ? PENDING_TITLE_POLL_MS[
            Math.min(pendingRounds++, PENDING_TITLE_POLL_MS.length - 1)
          ]
        : RESOLVED_TITLE_POLL_MS;
      timer = setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (cancelled) return;
      const current = treeRef.current;
      if (!current) return;
      const candidates = collectCandidates(current);
      if (candidates.length === 0) return;

      const results = await Promise.all(
        candidates.map(async (candidate) => {
          const key = lookupKey(candidate);
          try {
            const title = await AgentSessionTitle(
              projectName,
              candidate.session.provider,
              candidate.session.sessionId,
            );
            errorCountsRef.current.delete(key);
            return typeof title === "string" && title.trim()
              ? { ...candidate, title: title.trim() }
              : null;
          } catch {
            errorCountsRef.current.set(
              key,
              (errorCountsRef.current.get(key) ?? 0) + 1,
            );
            return null;
          }
        }),
      );
      if (cancelled) return;

      let next = treeRef.current;
      if (!next) return;
      let changed = false;
      for (const result of results) {
        if (!result) continue;
        // Re-read the tab: the tree may have moved on while the lookup ran.
        const pane = collectPanes(next).find((item) =>
          item.tabs.some((tab) => tab.id === result.tab.id),
        );
        const tab = pane?.tabs.find((item) => item.id === result.tab.id);
        if (!pane || !tab || !isTerminalTab(tab) || !followsAgentTitle(tab)) {
          continue;
        }
        const liveSession = agentSessionOf(tab);
        if (
          !liveSession ||
          liveSession.provider !== result.session.provider ||
          liveSession.sessionId !== result.session.sessionId
        ) {
          continue;
        }
        const title = disambiguateLabelAgainst(
          result.title,
          collectTerminals(next)
            .filter((item) => item.id !== tab.id)
            .map(terminalDisplayLabel),
        );
        if (tab.sessionTitle === title && titleResolved(tab, liveSession)) {
          continue;
        }
        next = mapPane(next, pane.id, (item) => ({
          ...item,
          tabs: item.tabs.map((candidate) =>
            candidate.id === tab.id
              ? {
                  ...candidate,
                  sessionTitle: title,
                  sessionTitleId: liveSession.sessionId,
                  sessionTitleSource: "vendor",
                }
              : candidate,
          ),
        }));
        changed = true;
      }
      if (changed) {
        treeRef.current = next;
        applyTree(next);
        pendingRounds = 0;
      }

      schedule(treeRef.current ? collectCandidates(treeRef.current) : []);
    };

    // Restored tabs already carry a title for their live session, so the first
    // sweep can wait rather than re-derive every transcript during startup.
    const initial = treeRef.current ? collectCandidates(treeRef.current) : [];
    if (initial.length > 0 && initial.every(({ tab, session }) => titleResolved(tab, session))) {
      schedule(initial);
    } else {
      void poll();
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectName, pollKey, treeRef, applyTree, enabled]);
}
