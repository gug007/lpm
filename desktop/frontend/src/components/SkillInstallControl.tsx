import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentSkillStatus, CliInstallStatus, InstallAgentSkill, InstallCli } from "../../bridge/commands";
import { BTN_SECONDARY } from "./ui/buttons";

export type SkillStatus = "loading" | "not-installed" | "outdated" | "installed";
export type CliStatus = "loading" | "unavailable" | "not-installed" | "installed" | "points-elsewhere";

export function fetchStatuses(): Promise<[SkillStatus, CliStatus]> {
  return Promise.all([
    AgentSkillStatus()
      .then((r) => r.status as SkillStatus)
      .catch((): SkillStatus => "not-installed"),
    CliInstallStatus()
      .then((r) => r.status as CliStatus)
      .catch((): CliStatus => "unavailable"),
  ]);
}

export function agentToolsAction(skill: SkillStatus, cli: CliStatus): "install" | "update" | null {
  if (skill === "loading" || cli === "loading") return null;
  if (skill === "not-installed") return "install";
  const cliNeedsInstall = cli === "not-installed" || cli === "points-elsewhere";
  if (skill === "outdated" || cliNeedsInstall) return "update";
  return null;
}

export async function installAgentTools() {
  await InstallAgentSkill();
  await installCliIfNeeded();
}

const CTA_GREEN =
  "rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90";

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin text-current">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-green)]">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function installCliIfNeeded() {
  try {
    const cli = await CliInstallStatus();
    if (cli.status === "installed" || cli.status === "unavailable") {
      toast.success("Skill installed");
      return;
    }
    await InstallCli();
    toast.success("Skill and command line tool installed");
  } catch (err) {
    toast.success("Skill installed");
    toast.error(String(err));
  }
}

export function SkillInstallControl() {
  const [skillStatus, setSkillStatus] = useState<SkillStatus>("loading");
  const [cliStatus, setCliStatus] = useState<CliStatus>("loading");
  const [installing, setInstalling] = useState(false);

  const refresh = async () => {
    const [skill, cli] = await fetchStatuses();
    setSkillStatus(skill);
    setCliStatus(cli);
  };

  useEffect(() => {
    refresh();
  }, []);

  const install = async () => {
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

  if (installing) {
    return (
      <button disabled className={BTN_SECONDARY}>
        <Spinner />
      </button>
    );
  }

  if (skillStatus === "loading" || cliStatus === "loading") {
    return <Spinner />;
  }

  const action = agentToolsAction(skillStatus, cliStatus);
  if (action === "install") {
    return (
      <button onClick={install} className={BTN_SECONDARY}>
        Install
      </button>
    );
  }

  if (action === "update") {
    return (
      <button onClick={install} className={CTA_GREEN}>
        Update
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
      <CheckIcon />
      Installed
    </span>
  );
}
