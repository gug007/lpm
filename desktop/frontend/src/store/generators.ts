import { create } from "zustand";
import { LoadGenerators, SaveGenerators } from "../../bridge/commands";
import type { Generator, GeneratorIcon, GeneratorsConfig, GeneratorDraft } from "../types";
import {
  applyAddCustom,
  applyDeleteCustom,
  applyHideDefault,
  applyRestoreDefault,
  applyReorder,
  applyUpdateGenerator,
  emptyGeneratorsConfig,
  normalizeGeneratorsConfig,
  resolveGenerators,
} from "../generators";
import { type ComposerAction } from "./composerActions";
import { DEFAULT_GENERATOR_PROMPT_ACTIONS } from "../generatorPromptActions";

type IconPatch = { label?: string; icon?: GeneratorIcon; prompt?: string };

interface GeneratorsActions {
  hydrate: () => Promise<void>;
  persist: (next: GeneratorsConfig) => Promise<void>;
  reorder: (activeId: string, overId: string) => Promise<void>;
  hideDefault: (id: string) => Promise<void>;
  restoreDefault: (id: string) => Promise<void>;
  addCustom: (gen: GeneratorDraft) => Promise<void>;
  updateGenerator: (id: string, patch: IconPatch, isDefault: boolean) => Promise<void>;
  deleteCustom: (id: string) => Promise<void>;
  savePromptActions: (actions: ComposerAction[]) => Promise<void>;
}

interface GeneratorsState extends GeneratorsActions {
  config: GeneratorsConfig;
}

export const useGeneratorsStore = create<GeneratorsState>((set, get) => ({
  config: emptyGeneratorsConfig(),

  hydrate: async () => {
    try {
      const raw = await LoadGenerators();
      set({ config: normalizeGeneratorsConfig(raw) });
    } catch {
      set({ config: emptyGeneratorsConfig() });
    }
  },

  persist: async (next) => {
    set({ config: next });
    await SaveGenerators(next);
  },

  reorder: async (activeId, overId) => {
    const cfg = get().config;
    const next = applyReorder(resolveGenerators(cfg), cfg, activeId, overId);
    if (next !== cfg) await get().persist(next);
  },

  hideDefault: async (id) => get().persist(applyHideDefault(get().config, id)),
  restoreDefault: async (id) => get().persist(applyRestoreDefault(get().config, id)),
  addCustom: async (gen) => get().persist(applyAddCustom(get().config, gen)),
  updateGenerator: async (id, patch, isDefault) =>
    get().persist(applyUpdateGenerator(get().config, id, patch, isDefault)),
  deleteCustom: async (id) => get().persist(applyDeleteCustom(get().config, id)),
  savePromptActions: async (actions) => get().persist({ ...get().config, promptActions: actions }),
}));

export function useResolvedGenerators(): Generator[] {
  return resolveGenerators(useGeneratorsStore((s) => s.config));
}

export function usePromptActions(): ComposerAction[] {
  const v = useGeneratorsStore((s) => s.config.promptActions);
  return v ?? DEFAULT_GENERATOR_PROMPT_ACTIONS;
}

export function useEnabledPromptActions(): ComposerAction[] {
  return usePromptActions().filter((a) => a.enabled);
}
