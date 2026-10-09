import { create } from "zustand";

export type UpdatePhase = "checking" | "downloading" | "installing";

export interface UpdateInstallState {
  active: boolean;
  phase: UpdatePhase;
  progress: number;
  cancelling: boolean;
  error: string;
}

export const IDLE_UPDATE_INSTALL: UpdateInstallState = {
  active: false,
  phase: "checking",
  progress: -1,
  cancelling: false,
  error: "",
};

// Shared so the sidebar row and Settings show the same install, whichever
// one started it.
export const useUpdateInstallState = create<UpdateInstallState>(() => IDLE_UPDATE_INSTALL);
