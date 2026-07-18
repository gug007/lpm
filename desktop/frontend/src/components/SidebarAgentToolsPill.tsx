import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  agentToolsAction,
  fetchStatuses,
  installAgentTools,
  type CliStatus,
  type SkillStatus,
} from "./SkillInstallControl";

export function SidebarAgentToolsPill() {
  const [skill, setSkill] = useState<SkillStatus>("loading");
  const [cli, setCli] = useState<CliStatus>("loading");
  const [installing, setInstalling] = useState(false);

  const refresh = async () => {
    const [s, c] = await fetchStatuses();
    setSkill(s);
    setCli(c);
  };

  useEffect(() => {
    refresh();
  }, []);

  const action = agentToolsAction(skill, cli);
  if (!action && !installing) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await installAgentTools();
    } catch (err) {
      toast.error(String(err));
    } finally {
      await refresh();
      setInstalling(false);
    }
  };

  return (
    <button
      onClick={handleInstall}
      disabled={installing}
      className="mx-2 mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]" />
      <span className="text-xs text-[var(--text-secondary)]">
        {installing ? "Installing…" : "Agent tools"}
      </span>
      {!installing && (
        <span className="ml-auto text-[10px] font-medium text-[var(--accent-green)]">
          {action === "install" ? "Install" : "Update"}
        </span>
      )}
    </button>
  );
}
