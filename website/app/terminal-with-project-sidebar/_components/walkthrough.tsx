"use client";

import { ArrowLeft, PanelLeftOpen, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  trackSidebarWalkthrough,
  type SidebarWalkthroughAction,
} from "@/lib/analytics";
import { SidebarPanel } from "./sidebar-panel";
import { SidebarResizer } from "./sidebar-resizer";
import { TabStrip } from "./tab-strip";
import { TerminalPanel } from "./terminal-panel";
import {
  SESSIONS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  otherSessionOf,
  projectByKey,
  sessionsOf,
  tabNumberOf,
  type ProjectKey,
  type WalkthroughSession,
} from "./walkthrough-data";
import { WalkthroughSteps, type WalkthroughStage } from "./walkthrough-steps";

const INITIAL_SESSION = "checkout-api";

/**
 * Where focus goes when a state swap unmounts or hides the control that was
 * just used. Matched against `data-focus` inside the walkthrough shell.
 */
type FocusTarget =
  | "active-session"
  | "selected-project"
  | "detail-back"
  | "show-sidebar"
  | "collapse-sidebar";

/** The one instruction per stage, shown in the lead and announced after it. */
const NEXT_STEP: Record<WalkthroughStage, string> = {
  tabs: "Switch to the auth hotfix.",
  organized: "Now go back to checkout.",
  done: "",
};

/** Matches the `md:` breakpoint the side-by-side layout switches at. */
const isSideBySide = () => window.matchMedia("(min-width: 48rem)").matches;

const initialLastSession = (): Record<ProjectKey, string> => {
  const map = {} as Record<ProjectKey, string>;
  for (const session of SESSIONS) {
    if (!map[session.project]) map[session.project] = session.id;
  }
  map.checkout = INITIAL_SESSION;
  return map;
};

const sessionById = (id: string): WalkthroughSession =>
  SESSIONS.find((session) => session.id === id) as WalkthroughSession;

export function Walkthrough() {
  const [stage, setStage] = useState<WalkthroughStage>("tabs");
  const [activeId, setActiveId] = useState(INITIAL_SESSION);
  const [lastSession, setLastSession] = useState(initialLastSession);
  const [folderOpen, setFolderOpen] = useState(true);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [hidden, setHidden] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const shell = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  // Survives "Run it again": each action is reported once per page view.
  const tracked = useRef(new Set<SidebarWalkthroughAction>());

  // A handler that hides the control it was fired from queues where focus
  // should land; this puts it there once that render has committed.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    shell.current
      ?.querySelector<HTMLElement>(`[data-focus="${target}"]`)
      ?.focus();
  });

  const track = (action: SidebarWalkthroughAction) => {
    if (tracked.current.has(action)) return;
    tracked.current.add(action);
    trackSidebarWalkthrough(action);
  };

  const active = sessionById(activeId);
  const selected = active.project;
  const organized = stage !== "tabs";

  const openSession = (id: string) => {
    track("start");
    const session = sessionById(id);
    setActiveId(id);
    setLastSession((prev) => ({ ...prev, [session.project]: id }));
  };

  const selectProject = (key: ProjectKey) => {
    setActiveId(lastSession[key]);
    setMobileView("detail");
    // Only stacked layouts hide the row that was clicked.
    if (!isSideBySide()) pendingFocus.current = "detail-back";
    if (stage === "organized" && key === "checkout") {
      setStage("done");
      track("complete");
      return;
    }
    track("select");
  };

  const showProjectList = () => {
    setMobileView("list");
    pendingFocus.current = "selected-project";
  };

  const organize = () => {
    setStage("organized");
    setMobileView("list");
    pendingFocus.current = "selected-project";
    track("organize");
  };

  const reset = () => {
    setStage("tabs");
    setActiveId(INITIAL_SESSION);
    setLastSession(initialLastSession);
    setFolderOpen(true);
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    setHidden(false);
    setMobileView("list");
    pendingFocus.current = "active-session";
  };

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    pendingFocus.current = next ? "show-sidebar" : "collapse-sidebar";
    if (next) track("collapse");
  };

  const commitResize = () => track("resize");

  const onAuthHotfix = selected === "auth-hotfix";

  const feedback =
    stage === "tabs"
      ? onAuthHotfix
        ? `Found it. Its other session is tab ${tabNumberOf(
            otherSessionOf("auth-hotfix", activeId).id,
          )} — a billing session and an SSH session sit between the two. The row is ordered by when each session was opened, not by what it belongs to.`
        : "Nine sessions, every one prefixed with the project it belongs to. Two of them are the auth hotfix."
      : stage === "organized"
        ? "Nothing started and nothing closed — only the grouping changed. auth-hotfix is one row now, and both of its terminals came with it."
        : "checkout came back on the terminal you left it on, scrollback and all, and the half-typed command in api is still at the prompt rather than re-run. The project you step away from stays mounted, so nothing has to restart when you return.";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div className="mb-6 flex justify-center">
        <WalkthroughSteps stage={stage} />
      </div>

      <p className="mx-auto mb-4 max-w-2xl text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {stage === "tabs" ? (
          <>
            You are mid-command in{" "}
            <code className="font-mono text-[13px] text-gray-900 dark:text-gray-200">
              checkout · api
            </code>
            . A ping lands: the auth hotfix needs a look.{" "}
            <strong className="font-semibold text-gray-900 dark:text-gray-100">
              {NEXT_STEP.tabs}
            </strong>
          </>
        ) : stage === "organized" ? (
          <>
            Same nine sessions, one row per project.{" "}
            <strong className="font-semibold text-gray-900 dark:text-gray-100">
              {NEXT_STEP.organized}
            </strong>
          </>
        ) : (
          <>
            That is the whole model. The sidebar below stays live — keep
            poking at it.
          </>
        )}
      </p>

      <div
        ref={shell}
        data-nosnippet
        className="overflow-hidden rounded-xl border border-gray-200 bg-[#181818] shadow-xl shadow-gray-200/50 dark:border-[#2e2e2e] dark:shadow-black/40"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#2e2e2e] px-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          {organized && hidden && (
            <button
              type="button"
              onClick={toggleHidden}
              data-focus="show-sidebar"
              className="hidden items-center gap-1.5 rounded-md border border-[#3a3a3a] px-2 py-1 text-[11px] text-[#d4d4d4] transition-colors hover:bg-[#2a2a2a] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none md:inline-flex"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
              Show sidebar
            </button>
          )}
          <span className="ml-auto truncate font-mono text-[11px] text-[#8f8f8f]">
            {organized
              ? `${projectByKey(selected).name} — lpm`
              : "9 sessions — flat tabs"}
          </span>
        </div>

        <div className="flex h-[21rem] min-h-0 sm:h-[23rem]">
          {!organized ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <TabStrip activeId={activeId} onSelect={openSession} />
              <TerminalPanel session={active} />
            </div>
          ) : (
            <>
              <div
                style={{ "--sw": `${width}px` } as React.CSSProperties}
                className={`${
                  mobileView === "list" ? "flex" : "hidden"
                } min-h-0 w-full ${
                  hidden ? "md:hidden" : "md:flex md:w-[var(--sw)] md:shrink-0"
                }`}
              >
                <SidebarPanel
                  selected={selected}
                  onSelect={selectProject}
                  folderOpen={folderOpen}
                  onToggleFolder={() => setFolderOpen((open) => !open)}
                  onHide={toggleHidden}
                />
              </div>
              {!hidden && (
                <SidebarResizer
                  width={width}
                  min={SIDEBAR_MIN_WIDTH}
                  max={SIDEBAR_MAX_WIDTH}
                  onResize={setWidth}
                  onCommit={commitResize}
                />
              )}
              <div
                className={`${
                  mobileView === "detail" ? "flex" : "hidden"
                } min-h-0 w-full md:flex md:w-auto md:flex-1`}
              >
                <TerminalPanel
                  session={active}
                  siblings={sessionsOf(selected)}
                  onSelectSession={openSession}
                  header={
                    <div className="flex shrink-0 items-center gap-2 border-b border-[#2e2e2e] px-3 py-2 md:hidden">
                      <button
                        type="button"
                        onClick={showProjectList}
                        data-focus="detail-back"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#3a3a3a] px-2 py-1 text-[11px] text-[#d4d4d4] transition-colors hover:bg-[#2a2a2a] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        Projects
                      </button>
                      <span className="truncate font-mono text-[11px] text-[#8f8f8f]">
                        {projectByKey(selected).name}
                      </span>
                    </div>
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>

      {stage === "tabs" && (
        <p className="mt-2.5 text-center text-[11px] text-gray-500 md:hidden dark:text-gray-400">
          The tab row scrolls sideways — swipe it to reach all nine sessions.
        </p>
      )}

      <p
        aria-live="polite"
        className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400"
      >
        {feedback}
        {NEXT_STEP[stage] && (
          <span className="sr-only"> Next: {NEXT_STEP[stage]}</span>
        )}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {stage === "tabs" &&
          (onAuthHotfix ? (
            <button
              type="button"
              onClick={organize}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
            >
              Organize by project
            </button>
          ) : (
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              Open one of the two auth-hotfix tabs to continue.
            </p>
          ))}
        {stage === "done" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Run it again
          </button>
        )}
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        lpm itself is a macOS app; this is a web illustration of its sidebar. On
        a phone the walkthrough runs as a staged project list and terminal
        detail — the resizable side-by-side layout, and ⌘B, belong to the
        desktop app.
      </p>
    </div>
  );
}
