import { listPhrase } from "./cronDescribe";
import type { ProjectInfo, ServiceInfo } from "./types";

type ExitFields = Pick<ServiceInfo, "exited" | "exitCode">;
type ProjectServices = Pick<ProjectInfo, "running" | "services">;

/** A started service whose command ended on its own with a failure. */
export function serviceCrashed(service: ExitFields): boolean {
  return !!service.exited && service.exitCode != null && service.exitCode !== 0;
}

/** How a started service ended: "exited with code 1", "exited", "stopped". */
export function serviceExitText(service: ExitFields): string {
  if (service.exitCode == null) return "stopped";
  return service.exitCode === 0 ? "exited" : `exited with code ${service.exitCode}`;
}

/** The started services of a project that are still running. */
export function liveServices(project: ProjectServices): ServiceInfo[] {
  return project.running ? (project.services ?? []).filter((s) => !s.exited) : [];
}

/** Whether anything of the project still runs: once every service it started
 *  has ended, it is up only in that their tabs are still open. */
export function projectUp(project: ProjectServices): boolean {
  const services = project.services ?? [];
  return project.running && (services.length === 0 || services.some((s) => !s.exited));
}

/** The started services of a running project that crashed. */
export function crashedServicesOf(project: ProjectServices): ServiceInfo[] {
  return project.running ? (project.services ?? []).filter(serviceCrashed) : [];
}

/** "web exited with code 1, worker exited with code 2", or null when no
 *  started service crashed. */
export function crashSummary(project: ProjectServices): string | null {
  const crashed = crashedServicesOf(project);
  if (crashed.length === 0) return null;
  return crashed.map((s) => `${s.name} ${serviceExitText(s)}`).join(", ");
}

/** The line under a project's sidebar row once a started service crashed:
 *  "web crashed · exit 1", "web and worker crashed". */
export function crashLine(project: ProjectServices): string | null {
  const crashed = crashedServicesOf(project);
  if (crashed.length === 0) return null;
  if (crashed.length === 1) return `${crashed[0].name} crashed · exit ${crashed[0].exitCode}`;
  return `${listPhrase(crashed.map((s) => s.name))} crashed`;
}

/** "Starting: api", "Not ready: web" while a running service's ready check
 *  hasn't passed, or null once every one has. */
export function pendingSummary(project: ProjectServices): string | null {
  const live = liveServices(project);
  const notReady = live.filter((s) => s.readiness === "notReady").map((s) => s.name);
  if (notReady.length > 0) return `Not ready: ${notReady.join(", ")}`;
  const starting = live.filter((s) => s.readiness === "starting" || s.readiness === "waiting").map((s) => s.name);
  return starting.length > 0 ? `Starting: ${starting.join(", ")}` : null;
}
