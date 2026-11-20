// Formats this build draws; another a config names asks for a newer lpm.
export const SHOWN_FORMATS = new Set(["html"]);

// Which of an action's pages: the card under its button, or its app's tab.
export type PopupView = "popup" | "tab";

// What `action_popup` and `action_app` answer: the page and the data its
// command printed, or the words shown instead (see src-tauri/src/popup_content.rs).
export interface PopupContent {
  // Seconds between refreshes while the card is open; 0 only when it opens.
  refresh: number;
  html?: string;
  // The page's file on the machine that made it, for its own files beside it.
  file?: string;
  data: unknown;
  text?: string;
  dataError?: string;
  error?: string;
  // When the page and data were made, in Unix milliseconds.
  updatedAt: number;
  // Older than the config's `cache`: shown while it's made again.
  stale?: boolean;
  // Why the last run failed while the last good result is shown.
  refreshError?: string;
}

export type PopupColor = "bg" | "surface" | "text" | "muted" | "border" | "accent" | "green" | "red" | "amber";

export interface PopupTheme {
  mode: "dark" | "light";
  colors: Record<PopupColor, string>;
}

// What the page reads as `window.lpm` (and gets again on each refresh).
export interface PopupPayload {
  data: unknown;
  text: string;
  error: string;
  theme: PopupTheme;
  project: string;
  action: string;
  view: PopupView;
}

// A popup page as a frame draws it.
export interface PopupPageProps {
  html: string;
  // Where the page's own files resolve from.
  base?: string;
  payload: PopupPayload;
  // A card's page has the config's size; an app's fills its tab.
  width: number | "100%";
  height: number | "100%";
  // An app's page, when its tab is in view with nothing drawn over it. A page
  // out of view keeps running, parked off screen.
  shown?: boolean;
  onFailure: (message: string) => void;
}

// What a refresh hands a page that's already open.
export function pushOf(payload: PopupPayload) {
  return { data: payload.data, text: payload.text, error: payload.error };
}
