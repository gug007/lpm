import { useEffect } from "react";
import { GetServiceLogs, NotifyUnattended } from "../../bridge/commands";
import { isAttended } from "../attention";
import { fixTabs, preferredFixOption, startFix } from "../ciFix";
import { paneSessionText, serviceSessionKey } from "../components/Pane";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import { stripAnsi } from "../components/terminal/filterLines";
import { serviceCrashPrompt } from "../components/terminal/serviceErrorPrompt";
import type { LaunchpadOption } from "../launchpadAgentActions";
import { toast } from "../notifications/toast";
import { crashToastId, crashedServices, type ServiceCrash } from "../serviceCrashAlerts";
import { useAppStore } from "../store/app";

// A stop or a restart passes through ended panes on its way, so a crash is
// told only once it has stood this long.
const SETTLE_MS = 1500;
const LOG_LINES = 400;

async function crashLog(crash: ServiceCrash): Promise<string> {
  const shown = paneSessionText(serviceSessionKey(crash.project, crash.service.name));
  if (shown.trim()) return shown;
  const captured = await GetServiceLogs(crash.project, crash.index, LOG_LINES).catch(() => "");
  return typeof captured === "string" ? stripAnsi(captured) : "";
}

async function fixCrash(crash: ServiceCrash, agent: LaunchpadOption): Promise<void> {
  const log = await crashLog(crash);
  startFix(crash.project, agent, serviceCrashPrompt(crash.service.name, crash.service.cmd, crash.exitCode, log));
}

function tell(crash: ServiceCrash): void {
  const app = useAppStore.getState();
  const label = displayNameForProjectName(crash.project, app.projects);
  const name = crash.service.name;
  void NotifyUnattended(`${name} crashed · ${label}`, `Exited with code ${crash.exitCode}.`, "serviceCrash").catch(
    () => {},
  );
  const onScreen = app.view === "projects" && app.selected === crash.project && isAttended();
  if (onScreen) return;
  const agent = preferredFixOption(fixTabs(crash.project));
  toast.error(`${name} crashed`, {
    id: crashToastId(crash),
    tag: label,
    description: `Exited with code ${crash.exitCode}`,
    event: "serviceCrash",
    action: { label: "Restart", onClick: () => void useAppStore.getState().restartService(crash.project, name) },
    actions: [
      ...(agent ? [{ label: `Fix with ${agent.label}`, onClick: () => void fixCrash(crash, agent) }] : []),
      { label: "Show", onClick: () => useAppStore.getState().selectProject(crash.project) },
    ],
  });
}

/** Says when a service crashes in a project you aren't looking at: a toast
 *  with Restart, Fix with … and Show, and a banner while lpm is in the
 *  background. Crashes already there when the projects first load aren't news. */
export function useServiceCrashAlerts(): void {
  useEffect(() => {
    let known: Map<string, ServiceCrash> | null = null;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const check = () => {
      const { projects, projectsLoad } = useAppStore.getState();
      if (projectsLoad !== "loaded") return;
      const crashes = crashedServices(projects);
      if (known === null) {
        known = crashes;
        return;
      }
      for (const [key] of crashes) {
        if (known.has(key) || pending.has(key)) continue;
        pending.set(
          key,
          setTimeout(() => {
            pending.delete(key);
            const still = crashedServices(useAppStore.getState().projects).get(key);
            if (still) tell(still);
          }, SETTLE_MS),
        );
      }
      const shown = new Set([...crashes.values()].map(crashToastId));
      for (const [key, crash] of known) {
        if (crashes.has(key)) continue;
        clearTimeout(pending.get(key));
        pending.delete(key);
        if (!shown.has(crashToastId(crash))) toast.dismiss(crashToastId(crash));
      }
      known = crashes;
    };

    check();
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.projects !== prev.projects || state.projectsLoad !== prev.projectsLoad) check();
    });
    return () => {
      unsubscribe();
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);
}
