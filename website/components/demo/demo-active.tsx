"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Whether the demo is worth animating: on screen, and in a tab someone is
 *  looking at. Everything that runs on a timer reads this, so a visitor who
 *  scrolls past leaves nothing burning behind them. */
const DemoActiveContext = createContext(true);

export const DemoActiveProvider = DemoActiveContext.Provider;

export function useDemoActive(): boolean {
  return useContext(DemoActiveContext);
}

/** True while the document is the one on screen. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
