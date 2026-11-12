import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { startFix } from "../ciFix";
import type { LaunchpadOption } from "../launchpadAgentActions";
import { FixWithAgentItems } from "./FixWithAgentItems";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface FixWithAgentButtonProps {
  projectName: string;
  /** What the agent is told, read when one is picked so it has the latest output. */
  prompt: () => string;
  /** What the picked agent is handed, for the menu's rows. */
  description: string;
  className: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
}

/** A "Fix ▾" button whose menu starts any agent the project offers in a new
 *  tab, told what went wrong. */
export function FixWithAgentButton({
  projectName,
  prompt,
  description,
  className,
  align = "end",
  side = "bottom",
}: FixWithAgentButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fix = (option: LaunchpadOption) => {
    setOpen(false);
    startFix(projectName, option, prompt());
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Start an agent in a new tab to fix this"
        className={className}
      >
        Fix
        <ChevronDown size={11} className="opacity-70" />
      </button>
      {open && buttonRef.current && (
        <ContextMenuShell anchor={buttonRef.current} align={align} side={side} minWidth={220} onClose={() => setOpen(false)}>
          <FixWithAgentItems projectName={projectName} onFix={fix} description={description} />
        </ContextMenuShell>
      )}
    </>
  );
}
