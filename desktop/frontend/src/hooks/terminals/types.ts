import { type RefObject } from "react";
import { type AdoptedTabOpts, type PaneNode, type PaneLeaf, type SplitDirection } from "../../paneTree";
import { type PersistedHistoryEntry } from "../../terminals";
import { type TerminalMemoryRef } from "../../terminalMemory";
import type { ModelPick } from "../../agentModelSwitch";
import type { SavedLayoutNode } from "../../savedLayouts";

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
  // The lpm-memory session the new tab inherits (a forked conversation keeps
  // writing to the session it was already working under).
  memory?: TerminalMemoryRef;
  // Starts the agent `cmd` launches on this model and level (Run in duplicates
  // racing models), as session-only flags.
  launchModel?: ModelPick;
  // A scheduled job's terminal: stays on the project's fixed Claude account.
  fixedAccount?: boolean;
  // Opened for someone else (a phone): added behind the tab in view, which stays.
  background?: boolean;
  // The pane the tab opens in; the focused one when unset or gone.
  paneId?: string;
}

export interface UseTerminalsResult {
  tree: PaneNode | null;
  focusedPaneId: string | null;
  // Settles once the saved tabs are back; until then `tree` is not the real one.
  restoreSettled: RefObject<Promise<void>>;
  createTerminal: (background?: boolean) => Promise<void>;
  createTerminalWithCmd: (label: string, cmd: string, opts?: TerminalStartOpts) => Promise<void>;
  adoptTerminal: (
    id: string,
    label?: string,
    opts?: AdoptedTabOpts,
  ) => Promise<void>;
  resumeFromHistory: (entry: PersistedHistoryEntry, background?: boolean) => Promise<void>;
  forkTerminal: (paneId: string, termId: string) => Promise<void>;
  forkTerminalIntoCopy: (paneId: string, termId: string) => Promise<void>;
  addTerminalToPane: (paneId: string) => Promise<void>;
  addBrowserToPane: (paneId?: string, url?: string, label?: string) => void;
  addMemoryToPane: (paneId?: string) => void;
  addToolkitToPane: (paneId?: string) => void;
  addFilesToPane: (paneId?: string) => void;
  addAutomationsToPane: (paneId?: string) => void;
  openAutomationsTab: () => Promise<void>;
  // Show a page of one of the project's servers, in the tab already on it or a new one.
  openBrowserTab: (url: string, label?: string, paneId?: string) => Promise<void>;
  closeTerminal: (paneId: string, tabIdx: number) => void;
  // Start a terminal whose process has ended again in its own tab.
  restartTerminal: (terminalId: string) => Promise<void>;
  // Continue a Claude tab's conversation on another Claude account.
  switchClaudeAccount: (terminalId: string, account: string, accountLabel?: string) => Promise<void>;
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
  restoreSessionTitle: (paneId: string, tabIdx: number) => void;
  toggleTabPinned: (paneId: string, tabIdx: number) => void;
  reorderTerminals: (paneId: string, order: string[]) => void;
  remoteCloseTerminal: (termId: string) => void;
  remoteForkTerminal: (termId: string) => void;
  remoteForkIntoCopy: (termId: string) => void;
  remoteCloseOthers: (termId: string) => void;
  removeAdoptedTerminal: (termId: string) => void;
  remoteRenameTerminal: (termId: string, label: string, emoji?: string) => void;
  remoteRestoreTitle: (termId: string) => void;
  remoteTogglePin: (termId: string) => void;
  remoteReorderTerminals: (order: string[]) => void;
  moveTerminal: (fromPaneId: string, termId: string, toPaneId: string, toIdx?: number) => void;
  splitPane: (paneId: string, direction: SplitDirection) => Promise<void>;
  // Opens a saved layout's panes; what is already open moves into its first.
  applyLayout: (root: SavedLayoutNode) => Promise<void>;
  // The panes on screen as a layout to save; null with nothing open.
  captureLayout: () => SavedLayoutNode | null;
  closePane: (paneId: string) => void;
  setRatio: (path: number[], ratio: number) => void;
  focusPane: (paneId: string) => void;
  ensureRootPane: (initialServiceName?: string) => Promise<void>;
  getFocusedPane: () => PaneLeaf | null;
  getPane: (paneId: string) => PaneLeaf | null;
  // Records that an lpm-memory invocation went into a terminal. `session` is
  // null for the bare "remember this conversation" form, whose slug the agent
  // hasn't chosen yet.
  noteTerminalMemory: (terminalId: string, session: string | null) => void;
  detachTerminalMemory: (terminalId: string) => void;
}
