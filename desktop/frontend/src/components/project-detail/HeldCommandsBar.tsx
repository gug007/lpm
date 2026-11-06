import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { AllowRepoCommands } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import { BarButton } from "../BarButton";

interface HeldCommandsBarProps {
  projectName: string;
  commands: string[];
}

// The commands the repo's .lpm.yml would run by itself (button labels,
// labelSvg, popups, automations), held until they're allowed: a repo from
// someone else mustn't run its code just because its project is open.
export function HeldCommandsBar({ projectName, commands }: HeldCommandsBarProps) {
  const [reviewing, setReviewing] = useState(false);
  const [allowing, setAllowing] = useState(false);
  const count = commands.length === 1 ? "a command" : `${commands.length} commands`;

  const allow = async () => {
    setAllowing(true);
    try {
      await AllowRepoCommands(projectName);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAllowing(false);
    }
  };

  return (
    <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-1.5 text-[12px]">
      <div className="flex items-center gap-2.5">
        <ShieldAlert size={13} className="shrink-0 text-[var(--accent-amber)]" />
        <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
          This repo's <span className="font-mono">.lpm.yml</span> has {count} that run by themselves. They wait until
          you allow them.
        </span>
        <BarButton aria-expanded={reviewing} onClick={() => setReviewing((v) => !v)}>
          {reviewing ? "Hide" : "Review"}
        </BarButton>
        <BarButton strong disabled={allowing} onClick={() => void allow()}>
          Allow
        </BarButton>
      </div>
      {reviewing && (
        <ul className="mt-1.5 space-y-1 pb-1 pl-[23px]">
          {commands.map((command) => (
            <li key={command} className="break-all font-mono text-[11.5px] text-[var(--text-primary)]">
              {command}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
