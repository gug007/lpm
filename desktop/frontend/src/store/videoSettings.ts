import { create } from "zustand";

// The Video settings window, opened from the Video button's hover card. Each
// window has its own, like the setup window.
export const useVideoSettings = create<{ open: boolean }>(() => ({ open: false }));

export function openVideoSettings(): void {
  useVideoSettings.setState({ open: true });
}

export function closeVideoSettings(): void {
  useVideoSettings.setState({ open: false });
}
