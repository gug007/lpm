// Vitest setup: happy-dom's user agent names the host OS ("X11; Linux x64",
// "Darwin arm64"), so detection would differ between a Mac and Linux CI. Pin
// macOS unless a test forces another platform before importing the app code.
if (typeof window !== "undefined" && !window.__LPM_PLATFORM__) {
  window.__LPM_PLATFORM__ = "macos";
}

export {};
