import { serviceCrashed, serviceExitText } from "../../serviceExit";
import { StateGlyph } from "../StateGlyph";

// Running, crashed or stopped, for a service's column header.
export function ServiceStateDot({ exited, exitCode }: { exited?: boolean; exitCode?: number | null }) {
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
