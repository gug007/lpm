import { create } from "zustand";

// Current URL of each in-pane browser tab, keyed by tab id, so the tab strip
// can show the page's favicon. Written by BrowserPane on navigation.
interface BrowserUrlState {
  urls: Record<string, string>;
  setUrl: (id: string, url: string) => void;
  clear: (id: string) => void;
}

export const useBrowserUrls = create<BrowserUrlState>((set) => ({
  urls: {},
  setUrl: (id, url) =>
    set((s) => (s.urls[id] === url ? s : { urls: { ...s.urls, [id]: url } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.urls)) return s;
      const next = { ...s.urls };
      delete next[id];
      return { urls: next };
    }),
}));
