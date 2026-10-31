import { Columns2 } from "lucide-react";
import { TerminalLine, type Line } from "@/components/terminal-line";
import { ClaudeBanner } from "./before-after-claude-banner";
import { CLAUDE_SESSION, PROMPT_FROM } from "./before-after-session";
import { ReplicaSidebar } from "./before-after-sidebar";
import { RUNNING_ZAP, Tab } from "./before-after-tab";

// The same window every lpm user works in, placed on the stage where the pile it
// replaces lies. Palette and structure are lifted from desktop/frontend/src.
const TEXT = "text-[#d4d4d4]";

// The app tints a tab's label with its agent's state: amber, pulsing, while it
// waits on you.
const NEEDS_YOU = "sidebar-waiting";

function SessionLine({ line }: { line: Line }) {
  return (
    <TerminalLine
      line={line}
      size="text-[0.95em] leading-[1.5]"
      fallback={TEXT}
      gapClass="mt-[1.5em]"
    />
  );
}

// `compact` is the phone stage's narrower window: the All tab goes and the tabs
// close up, so the ones that stay keep their full labels.
export function LpmReplica({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="flex h-full w-full overflow-hidden rounded-[0.9em] bg-[#1e1e1e] ring-1 ring-white/10 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.4)] dark:shadow-[0_12px_36px_-12px_rgba(0,0,0,0.9)]"
    >
      <ReplicaSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className={`flex shrink-0 items-center overflow-hidden bg-[#2d2d2d] py-[0.4em] ${
            compact ? "gap-[0.3em] px-[0.45em]" : "gap-[0.4em] px-[0.6em]"
          }`}
        >
          {!compact && (
            <Tab
              icon={
                <Columns2 className="h-[0.95em] w-[0.95em] shrink-0 text-[#8e8e8e]" />
              }
            >
              All
            </Tab>
          )}
          <Tab compact={compact} icon={RUNNING_ZAP} port=":8080">
            server
          </Tab>
          <Tab compact={compact} icon={RUNNING_ZAP} port=":6379">
            redis
          </Tab>
          <Tab
            compact={compact}
            active
            tone={NEEDS_YOU}
            icon={<span className="text-[0.95em] leading-none text-[#d97757]">✻</span>}
          >
            claude
          </Tab>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-[1em] py-[0.8em] font-mono [mask-image:linear-gradient(to_right,#000_95%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_95%,transparent)]">
          <ClaudeBanner cwd="~/Projects/auth-service" />
          {CLAUDE_SESSION.slice(0, PROMPT_FROM).map((l, i) => (
            <SessionLine key={i} line={l} />
          ))}
          {/* The permission prompt is what "Needs you" points at. Its gap moves
              onto the wrapper, so the ring hugs the prompt and every row stays
              where the pile's window expects it. */}
          <div data-agent-state="waiting" className="ba-state mt-[1.5em]">
            {CLAUDE_SESSION.slice(PROMPT_FROM).map((l, i) => (
              <SessionLine key={i} line={i === 0 ? { ...l, gap: false } : l} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
