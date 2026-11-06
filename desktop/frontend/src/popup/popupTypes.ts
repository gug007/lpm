// What `action_popup` answers: the page and the data its command printed, or
// the words the card shows instead (see src-tauri/src/popup_content.rs).
export interface PopupContent {
  format: string;
  title: string;
  width: number;
  height: number;
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

export interface PopupTheme {
  mode: "dark" | "light";
  colors: Record<string, string>;
}

// What the page reads as `window.lpm` (and gets again on each refresh).
export interface PopupPayload {
  data: unknown;
  text: string;
  error: string;
  theme: PopupTheme;
  project: string;
  action: string;
}

// A popup page as a frame draws it.
export interface PopupPageProps {
  html: string;
  // Where the page's own files resolve from.
  base?: string;
  payload: PopupPayload;
  width: number;
  height: number;
  onFailure: (message: string) => void;
}

// What a refresh hands a page that's already open.
export function pushOf(payload: PopupPayload) {
  return { data: payload.data, text: payload.text, error: payload.error };
}
