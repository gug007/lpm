import { listPhrase } from "./cronDescribe";
import type { ServiceInfo } from "./types";

// What a started service's ready checks still say about it, as its tab shows.
export type ServiceReadyState = Pick<ServiceInfo, "readiness" | "waitingFor" | "readyError">;

export function readyStateOf(service: ServiceReadyState): ServiceReadyState {
  return {
    readiness: service.readiness,
    waitingFor: service.waitingFor,
    readyError: service.readyError,
  };
}

/** Changes whenever any service's ready state does, for memo keys. */
export function readyStateKey(services: readonly ({ name: string } & ServiceReadyState)[]): string {
  return services
    .map((s) => (s.readiness ? `${s.name}:${s.readiness}:${(s.waitingFor ?? []).join("+")}` : ""))
    .join(",");
}

/** The tab's short label and its longer explanation, or null when ready. */
export function readyLabel(state: ServiceReadyState): { text: string; title: string } | null {
  switch (state.readiness) {
    case "waiting": {
      const on = state.waitingFor ?? [];
      return {
        text: on.length === 1 ? `Waiting for ${on[0]}` : "Waiting",
        title: on.length > 0 ? `Starts once ${listPhrase(on)} ${on.length === 1 ? "is" : "are"} ready` : "Waiting for its dependencies",
      };
    }
    case "starting":
      return { text: "Starting", title: "Running; its ready check hasn't passed yet" };
    case "notReady":
      return {
        text: "Not ready",
        title: `${state.readyError ?? "Its ready check hasn't passed"}. What waits for it started anyway.`,
      };
    default:
      return null;
  }
}
