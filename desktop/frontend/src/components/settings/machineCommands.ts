import {
  CheckClaudeHooks,
  CheckKokoroInstalled,
  ClearOpenAIKey,
  CrashReportConfig,
  HasOpenAIKey,
  InstallKokoro,
  ListSystemSounds,
  OpenAIVoices,
  PeerInvoke,
  ReadBranchNameInstructions,
  ReadCommitInstructions,
  ReadPRDescriptionInstructions,
  ReadPRTitleInstructions,
  ResetClaudeHooks,
  SaveBranchNameInstructions,
  SaveCommitInstructions,
  SavePRDescriptionInstructions,
  SavePRTitleInstructions,
  SetOpenAIKey,
  UninstallKokoro,
} from "../../../bridge/commands";
import { listMonospaceFonts, mergeFontLists } from "../terminal/fontDetect";
import {
  LOCAL_MOBILE,
  LOCAL_TAILNET,
  peerMobile,
  peerTailnet,
  type MobileCommands,
  type TailnetCommands,
} from "./mobileCommands";
import { LOCAL_STATUS_LINE, peerStatusLine, type StatusLineCommands } from "./statusLineCommands";
import { LOCAL_TELEGRAM, peerTelegram, type TelegramCommands } from "./telegramCommands";
import { LOCAL_TEMPLATES, peerTemplates, type TemplateCommands } from "./templateCommands";

// ClaudeHooksStatus in hooks/claude.rs.
export interface ClaudeHooksCheck {
  settingsExists: boolean;
  hooksInstalled: boolean;
  hooksDisabled: boolean;
  helperMissing: boolean;
}

// A command run on a connected machine, by name.
export type MachineRun = (cmd: string, args?: Record<string, unknown>) => Promise<any>;

// The AI instructions a machine applies to all of its projects (templates.rs).
export type InstructionKind = "commit" | "prTitle" | "prDescription" | "branchName";

// What Settings rows, and the pages they open, run on the machine they configure.
export interface MachineCommands {
  listSystemSounds: () => Promise<string[]>;
  listMonospaceFonts: () => Promise<string[]>;
  checkClaudeHooks: () => Promise<ClaudeHooksCheck>;
  resetClaudeHooks: () => Promise<void>;
  readInstructions: (kind: InstructionKind) => Promise<string>;
  saveInstructions: (kind: InstructionKind, content: string) => Promise<void>;
  statusLine: StatusLineCommands;
  templates: TemplateCommands;
  telegram: TelegramCommands;
  mobile: MobileCommands;
  tailnet: TailnetCommands;
  // The OpenAI speech key, kept in the machine's Keychain (secrets.rs) and never
  // read back, and the voices it offers.
  hasOpenAiKey: () => Promise<boolean>;
  setOpenAiKey: (key: string) => Promise<void>;
  clearOpenAiKey: () => Promise<void>;
  openAiVoices: () => Promise<string[]>;
  // The local Kokoro voice engine (tts.rs).
  kokoroInstalled: () => Promise<boolean>;
  installKokoro: () => Promise<void>;
  uninstallKokoro: () => Promise<void>;
  // Whether the machine's lpm was built to send crash reports (crashreport.rs).
  crashReportsAvailable: () => Promise<boolean>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const LOCAL_INSTRUCTIONS: Record<
  InstructionKind,
  { read: () => Promise<string>; save: (content: string) => Promise<void> }
> = {
  commit: { read: () => ReadCommitInstructions(), save: (c) => SaveCommitInstructions(c) },
  prTitle: { read: () => ReadPRTitleInstructions(), save: (c) => SavePRTitleInstructions(c) },
  prDescription: {
    read: () => ReadPRDescriptionInstructions(),
    save: (c) => SavePRDescriptionInstructions(c),
  },
  branchName: { read: () => ReadBranchNameInstructions(), save: (c) => SaveBranchNameInstructions(c) },
};

// The infix of each kind's read_…_instructions / save_…_instructions command.
const INSTRUCTION_COMMAND: Record<InstructionKind, string> = {
  commit: "commit",
  prTitle: "pr_title",
  prDescription: "pr_description",
  branchName: "branch_name",
};

export const LOCAL_COMMANDS: MachineCommands = {
  listSystemSounds: () => ListSystemSounds().then(strings),
  listMonospaceFonts,
  checkClaudeHooks: () => CheckClaudeHooks(),
  resetClaudeHooks: () => ResetClaudeHooks(),
  readInstructions: (kind) => LOCAL_INSTRUCTIONS[kind].read(),
  saveInstructions: (kind, content) => LOCAL_INSTRUCTIONS[kind].save(content),
  statusLine: LOCAL_STATUS_LINE,
  templates: LOCAL_TEMPLATES,
  telegram: LOCAL_TELEGRAM,
  mobile: LOCAL_MOBILE,
  tailnet: LOCAL_TAILNET,
  hasOpenAiKey: () => HasOpenAIKey().then(Boolean),
  setOpenAiKey: (key) => SetOpenAIKey(key),
  clearOpenAiKey: () => ClearOpenAIKey(),
  openAiVoices: () => OpenAIVoices().then(strings),
  kokoroInstalled: () => CheckKokoroInstalled().then(Boolean),
  installKokoro: () => InstallKokoro(),
  uninstallKokoro: () => UninstallKokoro(),
  crashReportsAvailable: () => CrashReportConfig().then(Boolean),
};

// The machine a page opened from Settings edits: a connected one's slug and
// name (both null for this machine), and the commands its pages run there.
export interface MachineScope {
  slug: string | null;
  name: string | null;
  commands: MachineCommands;
}

export const THIS_MACHINE: MachineScope = { slug: null, name: null, commands: LOCAL_COMMANDS };

// A connected machine's fonts are only the ones it lists: the probe that finds
// fonts a backend misses measures this machine's.
export function peerCommands(slug: string): MachineCommands {
  const run: MachineRun = (cmd, args = {}) => PeerInvoke(slug, cmd, args);
  return {
    listSystemSounds: () => run("list_system_sounds").then(strings),
    listMonospaceFonts: () =>
      run("list_monospace_fonts").then((fonts) => mergeFontLists(strings(fonts), [])),
    checkClaudeHooks: () => run("check_claude_hooks"),
    resetClaudeHooks: () => run("reset_claude_hooks").then(() => undefined),
    readInstructions: (kind) =>
      run(`read_${INSTRUCTION_COMMAND[kind]}_instructions`).then((text) => (typeof text === "string" ? text : "")),
    saveInstructions: (kind, content) =>
      run(`save_${INSTRUCTION_COMMAND[kind]}_instructions`, { content }).then(() => undefined),
    statusLine: peerStatusLine(run),
    templates: peerTemplates(run),
    telegram: peerTelegram(run),
    mobile: peerMobile(slug, run),
    tailnet: peerTailnet(run),
    hasOpenAiKey: () => run("has_openai_key").then(Boolean),
    setOpenAiKey: (key) => run("set_openai_key", { key }),
    clearOpenAiKey: () => run("clear_openai_key"),
    openAiVoices: () => run("openai_voices").then(strings),
    kokoroInstalled: () => run("check_kokoro_installed").then(Boolean),
    installKokoro: () => run("install_kokoro"),
    uninstallKokoro: () => run("uninstall_kokoro"),
    crashReportsAvailable: () => run("crash_report_config").then(Boolean),
  };
}

const peerCommandsBySlug = new Map<string, MachineCommands>();

// The commands of this machine (null) or a connected one, the same object each
// time so hooks can depend on it.
export function machineCommands(slug: string | null): MachineCommands {
  if (!slug) return LOCAL_COMMANDS;
  let commands = peerCommandsBySlug.get(slug);
  if (!commands) {
    commands = peerCommands(slug);
    peerCommandsBySlug.set(slug, commands);
  }
  return commands;
}
