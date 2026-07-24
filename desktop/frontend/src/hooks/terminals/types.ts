import { type PaneNode, type PaneLeaf, type SplitDirection } from "../../paneTree";
import { type PersistedHistoryEntry } from "../../terminals";

export interface TerminalStartOpts {
  configName?: string;
  cwd?: string;
  env?: Record<string, string>;
  actionName?: string;
  reuse?: boolean;
  emoji?: string;
  color?: string;
  // Submitted into the terminal after `cmd`, once the launched program goes
  // quiet — e.g. an initial task for an AI agent started by `cmd`. A string is
  // a text prompt; an array is ordered paste parts (text runs and image paths).
  prompt?: string | string[];
  // Persisted restore identity for the new tab (fork-into-copy): on restart the
  // tab relaunches with resumeCmd instead of re-running `cmd` (which would fork
  // again). Ignored on the configName path — the backend owns those cmds.
  startCmd?: string;
  resumeCmd?: string;
}

export interface UseTerminalsResult {
  tree: PaneNode | null;
  focusedPaneId: string | null;
  createTerminal: () => Promise<void>;
  createTerminalWithCmd: (label: string, cmd: string, opts?: TerminalStartOpts) => Promise<void>;
  adoptTerminal: (
    id: string,
    label?: string,
    opts?: { startCmd?: string; resumeCmd?: string; actionName?: string },
  ) => Promise<void>;
  resumeFromHistory: (entry: PersistedHistoryEntry) => Promise<void>;
  forkTerminal: (paneId: string, termId: string) => Promise<void>;
  forkTerminalIntoCopy: (paneId: string, termId: string) => Promise<void>;
  addTerminalToPane: (paneId: string) => Promise<void>;
  addBrowserToPane: (paneId?: string) => void;
  addReviewToPane: (paneId?: string) => void;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  closeOtherTerminals: (paneId: string, tabIdx: number) => void;
  focusTerminal: (paneId: string, tabIdx: number) => void;
  focusAdjacentPaneItem: (paneId: string, delta: 1 | -1, serviceNames: string[]) => void;
  focusService: (paneId: string, serviceName: string) => void;
  renameTerminal: (
    paneId: string,
    tabIdx: number,
    label: string,
    emoji?: string,
  ) => void;
  toggleTabPinned: (paneId: string, tabIdx: number) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
  remoteCloseTerminal: (termId: string) => void;
  removeAdoptedTerminal: (termId: string) => void;
  remoteRenameTerminal: (termId: string, label: string) => void;
  remoteTogglePin: (termId: string) => void;
  remoteReorderTerminals: (order: string[]) => void;
  moveTerminal: (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => void;
  splitPane: (paneId: string, direction: SplitDirection) => Promise<void>;
  closePane: (paneId: string) => void;
  setRatio: (path: number[], ratio: number) => void;
  focusPane: (paneId: string) => void;
  ensureRootPane: (initialServiceName?: string) => void;
  getFocusedPane: () => PaneLeaf | null;
  getPane: (paneId: string) => PaneLeaf | null;
}
