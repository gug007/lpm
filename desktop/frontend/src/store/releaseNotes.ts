import { create } from "zustand";
import { ReleaseNotes } from "../../bridge/commands";
import { logDiagnostic } from "../diagnostics";

export interface ReleaseNote {
  version: string;
  /** ISO 8601; empty when GitHub didn't say. */
  publishedAt: string;
  /** Empty for a release published without notes. */
  notes: string;
  beta: boolean;
}

export type ReleaseNotesEntry =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; releases: ReleaseNote[]; complete: boolean };

// Every release between the running version and the update on offer, fetched
// once per pair as soon as the update row appears, so hovering it is instant.
export const useReleaseNotes = create<Record<string, ReleaseNotesEntry>>(() => ({}));

const pairKey = (since: string, until: string) => `${since}..${until}`;

/** Fetches the pair's notes unless they're loaded or on the way; a failed
 *  fetch is tried again on the next call. */
export function loadReleaseNotes(since: string, until: string): void {
  const key = pairKey(since, until);
  const entry = useReleaseNotes.getState()[key];
  if (entry && entry.status !== "error") return;
  useReleaseNotes.setState({ [key]: { status: "loading" } });
  ReleaseNotes(since, until).then(
    (found: Partial<{ releases: ReleaseNote[]; complete: boolean }> | null) =>
      useReleaseNotes.setState({
        [key]: { status: "ready", releases: found?.releases ?? [], complete: found?.complete ?? true },
      }),
    (err: unknown) => {
      logDiagnostic("warn", "update.notes_failed", "Couldn't load release notes", err);
      useReleaseNotes.setState({ [key]: { status: "error" } });
    },
  );
}

export function useReleaseNotesBetween(since: string, until: string): ReleaseNotesEntry | undefined {
  return useReleaseNotes((s) => s[pairKey(since, until)]);
}
