import { serviceCrashed, serviceExitText } from "../../serviceExit";
import type { ServiceReadiness } from "../../types";
import { StateGlyph } from "../StateGlyph";

// Running, crashed or stopped, for a service's column header. A service held
// back for its dependencies hasn't started, so it reads as not running.
export function ServiceStateDot({
  exited,
  exitCode,
  readiness,
}: {
  exited?: boolean;
  exitCode?: number | null;
  readiness?: ServiceReadiness;
}) {
  if (readiness === "waiting") return <StateGlyph state="stopped" size="sm" title="Waiting to start" />;
  if (!exited) return <StateGlyph state="running" size="sm" />;
  const crashed = serviceCrashed({ exited: true, exitCode });
  return (
    <StateGlyph
      state={crashed ? "crashed" : "stopped"}
      size="sm"
      title={`${crashed ? "Crashed" : "Stopped"}: ${serviceExitText({ exitCode })}`}
    />
  );
}
