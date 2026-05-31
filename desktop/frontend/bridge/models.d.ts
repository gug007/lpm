// v2-shaped models shim — type side.
// Loosens model types to `any` so v3's stricter map-key nullability doesn't
// propagate through user code that was originally written against v2 types.

// Declaration merging: `main` and `notes` are also values at runtime (the .js
// file does `export * as main` / `export * as notes`), so they need a `const`
// declaration in addition to the namespace below.
export const main: any;
export const notes: any;

export namespace main {
  export type AICLIAvailability = any;
  export type ActionInfo = any;
  export type ActionInputInfo = any;
  export type ActionInputOption = any;
  export type Branch = any;
  export type BranchCommit = any;
  export type ChangedFile = any;
  export type ClaudeHooksStatus = any;
  export type GitStatus = any;
  export type HistoryEntry = any;
  export type ImportReport = any;
  export type MissingRoot = any;
  export type NotesAttachmentInput = any;
  export type OpenInTarget = any;
  export type PaneNode = any;
  export type PersistedTab = any;
  export type PortConflictInfo = any;
  export type PortForward = any;
  export type ProfileInfo = any;
  export type ProjectInfo = any;
  export type ProjectTerminalState = any;
  export type SSHConfig = any;
  export type SSHConfigHost = any;
  export type ServiceInfo = any;
  export type Settings = any;
  export type StatusEntry = any;
  export type TemplateInfo = any;
  export type TerminalEntry = any;
  export type TerminalLaunch = any;
  export type TerminalsConfig = any;
  export type UpdateInfo = any;
}

export namespace notes {
  export type Attachment = any;
  export type Chat = any;
  export type Message = any;
  export type SearchHit = any;
}
