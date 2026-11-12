import { serviceCrashed } from "./serviceExit";
import type { ProjectInfo, ServiceInfo } from "./types";

export interface ServiceCrash {
  project: string;
  service: ServiceInfo;
  index: number;
  exitCode: number;
}

/** Every started service that crashed, by `<project>/<service>:<exit code>`,
 *  so the same service crashing again with another code is news again. */
export function crashedServices(projects: readonly ProjectInfo[]): Map<string, ServiceCrash> {
  const crashes = new Map<string, ServiceCrash>();
  for (const project of projects) {
    if (!project.running) continue;
    (project.services ?? []).forEach((service, index) => {
      if (!serviceCrashed(service) || service.exitCode == null) return;
      crashes.set(`${project.name}/${service.name}:${service.exitCode}`, {
        project: project.name,
        service,
        index,
        exitCode: service.exitCode,
      });
    });
  }
  return crashes;
}

/** The toast a crash is shown under, the same for every exit code so a
 *  newer crash of the service replaces it. */
export function crashToastId(crash: ServiceCrash): string {
  return `service-crash:${crash.project}/${crash.service.name}`;
}
