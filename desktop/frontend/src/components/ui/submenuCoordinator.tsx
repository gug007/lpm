import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

interface Coordinator {
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
}

const CoordinatorContext = createContext<Coordinator | null>(null);

// Wraps a menu surface (the root shell, or a single submenu panel) so that at
// most one of its direct submenu children is open at a time: opening one evicts
// any sibling instead of leaving both on screen. Each panel gets its own
// coordinator, so nested submenus track their own children independently.
export function SubmenuCoordinator({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // setOpenId is stable, so the value only changes when a submenu opens/closes —
  // not on unrelated menu re-renders (e.g. position adjustments).
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <CoordinatorContext.Provider value={value}>{children}</CoordinatorContext.Provider>;
}

// A diagonal path from a submenu row to a far panel item briefly crosses
// sibling rows; closing instantly would kill the submenu mid-gesture.
const CLOSE_DELAY = 150;

// Open/close state for one submenu row, registered with the nearest
// SubmenuCoordinator. Falls back to local state when used without a coordinator.
export function useSubmenuDisclosure(disabled?: boolean) {
  const id = useId();
  const coord = useContext(CoordinatorContext);
  const [localOpen, setLocalOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const open = coord ? coord.openId === id : localOpen;

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    if (disabled) return;
    if (coord) coord.setOpenId(id);
    else setLocalOpen(true);
  };

  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => {
      // Guarded so a sibling that already claimed the slot isn't clobbered.
      if (coord) coord.setOpenId((cur) => (cur === id ? null : cur));
      else setLocalOpen(false);
    }, CLOSE_DELAY);
  };

  return { open, openNow, scheduleClose };
}
