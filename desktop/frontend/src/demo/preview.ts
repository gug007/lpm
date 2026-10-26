import YAML from "yaml";
import { applyConfigYaml } from "./commands/config";
import { addProject, changed, project, projectFromFolder } from "./commands/state";
import { PREVIEW_PROJECT } from "./seed";
import { waitFor } from "./tour/dom";
import { SOURCE, type AppMessage, type HostMessage } from "./tour/protocol";

type Unsourced<M> = M extends unknown ? Omit<M, "source"> : never;

// The header shows the config's own name, or its label.
function title(yaml: string): string | undefined {
  try {
    const doc: unknown = YAML.parse(yaml);
    if (typeof doc !== "object" || doc === null) return undefined;
    const { label, name } = doc as { label?: unknown; name?: unknown };
    return [label, name].find((v): v is string => typeof v === "string" && v !== "");
  } catch {
    return undefined;
  }
}

// A docs page's config editor drives one project: each file it sends replaces
// the project's config, as saving that file in lpm would.
export function startConfigPreview(): void {
  addProject(projectFromFolder(PREVIEW_PROJECT, `~/Projects/${PREVIEW_PROJECT}`));
  if (window.parent === window) return;
  const post = (message: Unsourced<AppMessage>) =>
    window.parent.postMessage({ source: SOURCE, ...message }, window.location.origin);

  window.addEventListener("message", (e) => {
    const message = e.data as HostMessage | null;
    if (e.source !== window.parent || message?.source !== SOURCE || message.type !== "config") return;
    const p = project(PREVIEW_PROJECT);
    if (!p) return;
    try {
      applyConfigYaml(p, message.yaml);
    } catch {
      return;
    }
    p.label = title(message.yaml);
    changed();
  });

  // The app's modules load after this file has installed the backend they
  // call, so the store is reached once the window is up.
  void waitFor(() => document.querySelector("main"), 30_000)
    .then(() => import("../store/app"))
    .then(({ useAppStore }) => {
      useAppStore.setState({ sidebarCollapsed: true });
      post({ type: "ready" });
    });
}
