export type AlternativeKey =
  | "lpm"
  | "dedicatedClient"
  | "generalTerminal"
  | "openssh"
  | "editorRemote";

export type Capability = {
  label: string;
  note: string;
} & Record<AlternativeKey, boolean>;

export const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "dedicatedClient", label: "Dedicated SSH client" },
  { key: "generalTerminal", label: "Terminal running raw ssh" },
  { key: "openssh", label: "raw OpenSSH" },
  { key: "editorRemote", label: "Editor Remote-SSH" },
];

export const CAPABILITIES: Capability[] = [
  {
    label: "Reads ~/.ssh/config hosts without replacing OpenSSH",
    note: "lpm uses the selected Host alias when it connects, so OpenSSH remains responsible for options like HostName, ProxyJump, ProxyCommand, Port, and IdentityFile.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: true,
    openssh: true,
    editorRemote: true,
  },
  {
    label: "Remote services stream into project panes like local ones",
    note: "This is the lpm project model: services, actions, terminals, and SSH settings live together instead of being separate saved sessions.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Declared remote service ports forward once they listen",
    note: "lpm watches remote listening ports for SSH projects and auto-forwards ports declared in the project's services config.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Manual forwards wait for localhost readiness",
    note: "When you add a forward, lpm waits until the local listener accepts a TCP connection before reporting success.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Project stop cleans up the SSH forwards it started",
    note: "Forwards are owned by the lpm project lifecycle, not by whichever tab happened to run an ssh command.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Run local tools against a synced mirror of the remote tree that pushes changes back",
    note: "lpm keeps a local mirror of the remote project directory, runs the action against that mirror on your Mac, then syncs the edits back to the remote host.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
];
