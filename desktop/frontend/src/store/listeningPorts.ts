import { create } from "zustand";
import { ListPortsOverview } from "../../bridge/commands";
import type { PortsOverview } from "../components/ports/portsModel";

interface ListeningPortsState {
  overview: PortsOverview | null;
  loadedAt: number;
  loading: boolean;
  error: string;
  // Include each connected paired computer's ports.
  computers: boolean;
  load: () => Promise<void>;
  setComputers: (on: boolean) => void;
}

// A slower read retires itself when a newer one was asked for meanwhile, so a
// toggle of Paired computers never lands under the read that came before it.
let latest = 0;

export const useListeningPorts = create<ListeningPortsState>((set, get) => ({
  overview: null,
  loadedAt: 0,
  loading: false,
  error: "",
  computers: false,
  load: async () => {
    const mine = ++latest;
    set({ loading: true });
    try {
      const overview = (await ListPortsOverview(get().computers)) as PortsOverview;
      if (mine === latest) set({ overview, loadedAt: Date.now(), error: "" });
    } catch (cause) {
      if (mine === latest) set({ error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      if (mine === latest) set({ loading: false });
    }
  },
  setComputers: (computers) => {
    set({ computers });
    void get().load();
  },
}));
