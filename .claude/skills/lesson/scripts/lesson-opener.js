// The lesson app's stand-in for @tauri-apps/plugin-opener (vite.lesson.config.mjs):
// a URL the app would open in the browser is only noted in
// window.__lessonOpened, so a take never opens a page on the user's Mac.
// Everything else is the real plugin.
export * from "../../../../desktop/frontend/node_modules/@tauri-apps/plugin-opener/dist-js/index.js";

window.__lessonOpened = window.__lessonOpened || [];

export async function openUrl(url) {
  window.__lessonOpened.push(String(url));
}
