import { create } from "zustand";
import type { ZoneInfo } from "../types";
import { layerOfListKey, layersOf, zoneListKey, zoneOfListKey } from "../zoneLayers";

const STORAGE_KEY = "lpm.zoneLayers";

type OpenMap = Record<string, string>;

function mapKey(project: string, zone: string): string {
  return `${project}\u0000${zone}`;
}

function load(): OpenMap {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function save(open: OpenMap): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

interface ZoneLayersState {
  open: OpenMap;
  setOpen: (project: string, zone: string, layer: string) => void;
}

export const useZoneLayers = create<ZoneLayersState>((set, get) => ({
  open: load(),
  setOpen: (project, zone, layer) => {
    const open = { ...get().open, [mapKey(project, zone)]: layer };
    save(open);
    set({ open });
  },
}));

export function resolveOpenLayer(
  zone: Pick<ZoneInfo, "layers">,
  stored: string | undefined,
): string | null {
  const layers = layersOf(zone);
  if (layers.length === 0) return null;
  return layers.some((layer) => layer.name === stored) ? stored! : layers[0].name;
}

export function useOpenLayer(project: string, zone: Pick<ZoneInfo, "name" | "layers">): string | null {
  const stored = useZoneLayers((state) => state.open[mapKey(project, zone.name)]);
  return resolveOpenLayer(zone, stored);
}

export function openListKey(project: string, zone: Pick<ZoneInfo, "name" | "layers">): string {
  const stored = useZoneLayers.getState().open[mapKey(project, zone.name)];
  return zoneListKey(zone.name, resolveOpenLayer(zone, stored));
}

// Opens the layer a list key names; a zone without layers has none to open.
export function openLayerOfListKey(project: string, key: string): void {
  const layer = layerOfListKey(key);
  if (layer) useZoneLayers.getState().setOpen(project, zoneOfListKey(key), layer);
}
