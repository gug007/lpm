export type ProjectFiles = {
  // Paths whose content is filled in from the path itself. Folders are derived.
  paths: string[];
  // The files the demo's own logs, actions and transcripts talk about, written
  // out so opening one lands on the thing the visitor just read about.
  content: Record<string, string>;
};
