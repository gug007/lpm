import { useCallback, useEffect, useMemo, useState } from "react";
import { peerSlugOf } from "../../../peer/markers";
import { usePeerState, type PeerClient } from "../../../peer/usePeerState";
import { machineChoices, type MachineChoice } from "../../../peer/machineChoices";
import type { JobInfo } from "../../../jobsFormat";

export interface JobHost {
  /// The paired machine the job lives on, by slug; undefined = this Mac.
  host: string | undefined;
  peer: PeerClient | undefined;
  /// This computer and the paired ones a job can run on.
  choices: MachineChoice[];
  /// This computer's hostId.
  myId: string;
  /// The hostId of the machine the job lives on; empty while unknown.
  hostId: string;
  setHost: (host: string | undefined) => void;
  /// Whether `name` is a project on the job's machine.
  onHost: (name: string) => boolean;
}

// Which machine the job being edited lives on, or a new job will: the one its
// project is on, else this Mac until another is picked.
export function useJobHost(
  open: boolean,
  editing: { project: string; job: JobInfo } | null,
  newProject: string | undefined,
): JobHost {
  const { state } = usePeerState();
  const [host, setHost] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const project = editing?.project ?? newProject;
    setHost(editing?.job.host ?? (project ? (peerSlugOf(project) ?? undefined) : undefined));
  }, [open, editing?.project, editing?.job.host, newProject]);

  const onHost = useCallback((name: string) => (peerSlugOf(name) ?? undefined) === host, [host]);
  const choices = useMemo(() => machineChoices(state), [state]);
  const peer = host ? state.peers.find((p) => p.slug === host) : undefined;

  return {
    host,
    peer,
    choices,
    myId: state.host.hostId,
    hostId: host ? (peer?.hostId ?? "") : state.host.hostId,
    setHost,
    onHost,
  };
}
