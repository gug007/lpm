import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentSkillStatus, CliInstallStatus, InstallAgentSkill, InstallCli } from "../../bridge/commands";
import { BTN_SECONDARY } from "./ui/buttons";

type SkillStatus = "loading" | "not-installed" | "outdated" | "installed" | "installing";

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

export function SkillInstallControl({ onCliStatusMaybeChanged }: { onCliStatusMaybeChanged: () => void }) {
  const [status, setStatus] = useState<SkillStatus>("loading");

  useEffect(() => {
    AgentSkillStatus()
      .then((r) => setStatus(r.status as SkillStatus))
      .catch(() => setStatus("not-installed"));
  }, []);

  const install = async () => {
    const prev = status;
    setStatus("installing");
    try {
      await InstallAgentSkill();
      await installCliIfNeeded();
      const r = await AgentSkillStatus();
      setStatus(r.status as SkillStatus);
    } catch (err) {
      toast.error(String(err));
      setStatus(prev);
    } finally {
      onCliStatusMaybeChanged();
    }
  };

  if (status === "loading") {
    return <Spinner />;
  }

  if (status === "installing") {
    return (
      <button disabled className={BTN_SECONDARY}>
        <Spinner />
      </button>
    );
  }

  if (status === "installed") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <CheckIcon />
        Installed
      </span>
    );
  }

  if (status === "outdated") {
    return (
      <button onClick={install} className={CTA_GREEN}>
        Update
      </button>
    );
  }

  return (
    <button onClick={install} className={BTN_SECONDARY}>
      Install
    </button>
  );
}
