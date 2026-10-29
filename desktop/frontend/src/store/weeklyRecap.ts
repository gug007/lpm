import { create } from "zustand";
import type { RecapPeriod, RecapWeek } from "../components/recap/weeklyRecapModel";

interface WeeklyRecapState {
  open: boolean;
  week: RecapWeek;
  period: RecapPeriod;
  show: (week?: RecapWeek, period?: RecapPeriod) => void;
  close: () => void;
}

export const useWeeklyRecapStore = create<WeeklyRecapState>((set) => ({
  open: false,
  week: "last",
  period: "week",
  show: (week = "last", period = "week") => set({ open: true, week, period }),
  close: () => set({ open: false }),
}));
