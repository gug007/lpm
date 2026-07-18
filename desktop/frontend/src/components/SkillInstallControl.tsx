import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentSkillStatus, CliInstallStatus, InstallAgentSkill, InstallCli } from "../../bridge/commands";
import { BTN_SECONDARY } from "./ui/buttons";

export type SkillStatus = "loading" | "not-installed" | "outdated" | "installed";
export type CliStatus =
  | "loading"
  | "unavailable"
  | "not-installed"
  | "installed"
  | "points-elsewhere"
  | "shadowed";

export type SkillResult = {
  status: SkillStatus;
  installedVersion?: string;
  bundledVersion?: string;
};

export type CliResult = {
  status: CliStatus;
  shadowedBy?: string;
  linkPath?: string;
  version?: string;
};

export function fetchStatuses(): Promise<[SkillResult, CliResult]> {
  return Promise.all([
    AgentSkillStatus()
      .then((r): SkillResult => ({
        status: r.status as SkillStatus,
        installedVersion: r.installedVersion ?? undefined,
        bundledVersion: r.bundledVersion ?? undefined,
      }))
      .catch((): SkillResult => ({ status: "not-installed" })),
    CliInstallStatus()
      .then((r): CliResult => ({
        status: r.status as CliStatus,
        shadowedBy: r.shadowedBy ?? undefined,
        linkPath: r.linkPath ?? undefined,
        version: r.cliVersion ?? undefined,
      }))
      .catch((): CliResult => ({ status: "unavailable" })),
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

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-amber)]">
      <path
        d="M12 3.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VersionLine({ cliVersion, skillVersion }: { cliVersion?: string; skillVersion?: string }) {
  const parts: string[] = [];
  if (cliVersion) parts.push(`CLI ${cliVersion}`);
  if (skillVersion) parts.push(`Skills ${skillVersion}`);
  if (parts.length === 0) return null;
  return (
    <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{parts.join(" · ")}</span>
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
  const [skill, setSkill] = useState<SkillResult>({ status: "loading" });
  const [cli, setCli] = useState<CliResult>({ status: "loading" });
  const [installing, setInstalling] = useState(false);
  const skillStatus = skill.status;
  const cliStatus = cli.status;

  const refresh = async () => {
    const [skillResult, cliResult] = await fetchStatuses();
    setSkill(skillResult);
    setCli(cliResult);
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

  const skillVersion = skill.installedVersion ?? skill.bundledVersion;
  const versionLine = <VersionLine cliVersion={cli.version} skillVersion={skillVersion} />;

  if (cliStatus === "shadowed") {
    const other = cli.shadowedBy ?? "another location";
    const managed = cli.linkPath ?? "/usr/local/bin/lpm";
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span
          className="flex items-center gap-1.5 text-xs text-[var(--accent-amber)]"
          title={`Another lpm at ${other} takes precedence over ${managed}. Remove it to use the app-managed CLI.`}
        >
          <WarningIcon />
          Shadowed
        </span>
        {versionLine}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <CheckIcon />
        Installed
      </span>
      {versionLine}
    </div>
  );
}
