import { CancelActionBackground, RunActionBackground } from "../../bridge/commands";
import { showBackgroundRunToast, type BackgroundRunStatus } from "../components/BackgroundRunToast";
import { collectRunLines, type PageRunResult } from "../popup/pageRun";
import { trackBackgroundRun } from "../store/backgroundRuns";
import type { ActionInfo } from "../types";

// A `background` action's run, its progress in a toast, and its output for the
// page that ran it.
export async function runBackgroundAction(
  projectName: string,
  action: ActionInfo,
  inputValues: Record<string, string>,
  done?: (result: PageRunResult) => void,
) {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  trackBackgroundRun(runId);
  const show = (status: BackgroundRunStatus, error?: string) =>
    showBackgroundRunToast({
      runId,
      label: action.label,
      status,
      startedAt,
      error,
      onCancel: () => void CancelActionBackground(runId).catch(() => {}),
    });
  show("running");
  const lines = done ? await collectRunLines(runId) : null;
  try {
    await RunActionBackground(projectName, action.name, inputValues, runId);
    show("success");
    done?.({ ok: true, output: lines?.output() });
  } catch (err) {
    const cancelled = String(err) === "cancelled";
    if (cancelled) show("cancelled");
    else show("error", String(err));
    done?.({ ok: false, output: lines?.output(), ...(cancelled ? { canceled: true } : { error: String(err) }) });
  } finally {
    lines?.dispose();
  }
}
