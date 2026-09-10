import { create } from "zustand";
import { LoadWorkStatuses, SaveWorkStatuses } from "../../bridge/commands";
import type { CustomWorkStatus } from "../types";
import { DEFAULT_WORK_STATUS_PALETTE } from "../workStatus";

/** What `statuses.json` holds once the host has resolved it: the palette
 *  (the shipped statuses until the user changes them; `[]` once they remove
 *  the lot) and the menu order when they have dragged it. */
export interface WorkStatusesConfig {
  custom: CustomWorkStatus[];
  order?: string[];
}

/** Reads the file leniently: a row needs a non-empty label and an emoji to
 *  count, and the order keeps only strings. The host already resolves a
 *  missing palette to the shipped one; doing it here too keeps an older host
 *  honest, while an explicit `[]` stays the user's own decision. */
export function normalizeWorkStatusesConfig(raw: unknown): WorkStatusesConfig {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const custom = !Array.isArray(doc.custom)
    ? DEFAULT_WORK_STATUS_PALETTE
    : doc.custom.flatMap((item): CustomWorkStatus[] => {
        if (!item || typeof item !== "object") return [];
        const { label, emoji, withNote } = item as Record<string, unknown>;
        if (typeof label !== "string" || !label.trim() || typeof emoji !== "string") return [];
        return [{ label: label.trim(), emoji, ...(withNote === true ? { withNote: true } : {}) }];
      });
  const order = Array.isArray(doc.order)
    ? doc.order.filter((key): key is string => typeof key === "string")
    : undefined;
  return order && order.length > 0 ? { custom, order } : { custom };
}

interface WorkStatusesState extends WorkStatusesConfig {
  hydrate: () => Promise<void>;
  // A patch without `order` leaves the stored order alone.
  update: (patch: Partial<WorkStatusesConfig>) => Promise<void>;
}

/** The user's statuses and the menu's order, kept in their own file
 *  (`~/.lpm/statuses.json`) rather than among the app settings. */
export const useWorkStatusesStore = create<WorkStatusesState>((set, get) => ({
  custom: DEFAULT_WORK_STATUS_PALETTE,
  order: undefined,

  hydrate: async () => {
    try {
      set(normalizeWorkStatusesConfig(await LoadWorkStatuses()));
    } catch {
      set({ custom: DEFAULT_WORK_STATUS_PALETTE, order: undefined });
    }
  },

  update: async (patch) => {
    const next: WorkStatusesConfig = {
      custom: patch.custom ?? get().custom,
      order: "order" in patch ? patch.order : get().order,
    };
    set(next);
    await SaveWorkStatuses(next);
  },
}));

export function saveWorkStatuses(patch: Partial<WorkStatusesConfig>): Promise<void> {
  return useWorkStatusesStore.getState().update(patch);
}
