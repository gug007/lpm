import { createContext, useContext } from "react";

// Holding a dragged item over a spring-load target this long opens its menu
// (top-level dropdown or drill submenu) so the user can drop deeper.
export const SPRING_LOAD_MS = 700;

// True while a drag is dwelling over the surrounding sortable item, so a menu
// trigger nested inside it can spring its dropdown open.
export const SpringOverContext = createContext(false);

export function useSpringOver(): boolean {
  return useContext(SpringOverContext);
}
