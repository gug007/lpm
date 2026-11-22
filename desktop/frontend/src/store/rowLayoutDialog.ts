import { create } from "zustand";

// Whether the Row builder is open. Anything can open it: the project menu,
// Settings, the command palette.
export const useRowLayoutDialog = create<{ open: boolean }>(() => ({ open: false }));

export const openRowLayoutDialog = () => useRowLayoutDialog.setState({ open: true });
export const closeRowLayoutDialog = () => useRowLayoutDialog.setState({ open: false });
