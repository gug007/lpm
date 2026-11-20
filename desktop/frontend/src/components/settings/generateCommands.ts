import {
  ClearGenerateKey,
  GenerateAllowedProjects,
  GenerateForgetProjects,
  GenerateKeyStatus,
  GenerateOptions,
  GenerateUsage,
  SetGenerateKey,
} from "../../../bridge/commands";
import type {
  GenerateKeys,
  GenerateOptions as Options,
  GenerateProvider,
  GenerateUsage as Usage,
} from "../../generate";
import type { MachineRun } from "./machineCommands";

// What Settings › Images & speech runs on a machine (generate/commands.rs). Keys
// are saved there and never read back.
export interface GenerateCommands {
  keys: () => Promise<GenerateKeys>;
  setKey: (provider: GenerateProvider, key: string) => Promise<void>;
  clearKey: (provider: GenerateProvider) => Promise<void>;
  options: () => Promise<Options>;
  usage: () => Promise<Usage>;
  allowedProjects: () => Promise<string[]>;
  forgetProjects: () => Promise<void>;
}

function keys(value: unknown): GenerateKeys {
  const v = (value ?? {}) as Partial<GenerateKeys>;
  return { gemini: v.gemini === true, openai: v.openai === true };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export const LOCAL_GENERATE: GenerateCommands = {
  keys: () => GenerateKeyStatus().then(keys),
  setKey: (provider, key) => SetGenerateKey(provider, key),
  clearKey: (provider) => ClearGenerateKey(provider),
  options: () => GenerateOptions(),
  usage: () => GenerateUsage(),
  allowedProjects: () => GenerateAllowedProjects().then(strings),
  forgetProjects: () => GenerateForgetProjects(),
};

export function peerGenerate(run: MachineRun): GenerateCommands {
  return {
    keys: () => run("generate_key_status").then(keys),
    setKey: (provider, key) => run("set_generate_key", { provider, key }),
    clearKey: (provider) => run("clear_generate_key", { provider }),
    options: () => run("generate_options"),
    usage: () => run("generate_usage"),
    allowedProjects: () => run("generate_allowed_projects").then(strings),
    forgetProjects: () => run("generate_forget_projects").then(() => undefined),
  };
}
