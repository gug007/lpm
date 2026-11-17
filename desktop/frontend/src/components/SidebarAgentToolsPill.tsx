import { useEffect, useState } from "react";
import { toast } from "../notifications/toast";
import { RefreshAgentTools } from "../../bridge/commands";
import {
  agentToolsAction,
  fetchStatuses,
  installAgentTools,
  type CliResult,
  type SkillResult,
} from "./SkillInstallControl";
import { BTN_SECONDARY } from "./ui/buttons";

export function SidebarAgentToolsPill() {
  const [skill, setSkill] = useState<SkillResult>({ status: "loading" });
  const [cli, setCli] = useState<CliResult>({ status: "loading" });
  const [installing, setInstalling] = useState(false);

  const refresh = async () => {
    const [s, c] = await fetchStatuses();
    setSkill(s);
    setCli(c);
  };

  useEffect(() => {
    RefreshAgentTools()
      .catch(() => {})
      .then(refresh);
  }, []);

  const action = agentToolsAction(skill.status, cli.status);
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
    <div className="mx-2 mb-2 flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 py-2 pl-3 pr-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-[var(--text-primary)]">
          {installing ? "Installing agent tools…" : "Agent tools"}
        </span>
        <span className="block text-[11px] leading-snug text-[var(--text-muted)]">
          lpm's CLI and skills for Claude Code and Codex
        </span>
      </span>
      {!installing && (
        <button
          type="button"
          onClick={handleInstall}
          className={`${BTN_SECONDARY} shrink-0`}
        >
          {action === "install" ? "Install" : "Update"}
        </button>
      )}
    </div>
  );
}
