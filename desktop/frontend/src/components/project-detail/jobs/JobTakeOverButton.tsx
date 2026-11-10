import { useState } from "react";
import { TakeOverJobRun } from "../../../../bridge/commands";
import { errorText } from "../../../hooks/useJobCommands";
import { toast } from "../../../notifications/toast";
import { useAppStore } from "../../../store/app";
import type { SpawnTask } from "../../../types";

interface JobTakeOverButtonProps {
  project: string;
  jobId: string;
  className: string;
}

// A running Claude automation takes no input, so taking it over ends the run
// and carries its conversation on in a terminal, in the folder it was working
// in. Watching it needs none of this: the run's own page streams it.
export function JobTakeOverButton({ project, jobId, className }: JobTakeOverButtonProps) {
  const [opening, setOpening] = useState(false);

  const takeOver = async () => {
    setOpening(true);
    try {
      const tab = (await TakeOverJobRun(project, jobId)) as { project: string; task: SpawnTask };
      const store = useAppStore.getState();
      store.selectProject(tab.project);
      store.queueSpawnTask(tab.project, tab.task);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void takeOver()}
      disabled={opening}
      title="Stops this run and carries it on in a terminal"
      className={className}
    >
      {opening ? "Opening…" : "Take over in terminal"}
    </button>
  );
}
