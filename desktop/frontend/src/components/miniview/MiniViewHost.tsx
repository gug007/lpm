import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { MINI_VIEW_CHORD } from "../../miniViewChord";
import { toggleMiniView } from "../../miniViewToggle";
import { useAppStore } from "../../store/app";
import { useMiniViews } from "../../store/miniViews";
import { useTerminalTitles } from "../../store/terminalTitles";
import { hasInteractivePaneSession } from "../InteractivePane";
import { MiniViewCard } from "./MiniViewCard";

// The tab on screen in the project on screen, kept or taken out again.
function toggleTabOnScreen(): void {
  const { selected, view } = useAppStore.getState();
  if (view !== "projects" || !selected) return;
  const titles = useTerminalTitles.getState();
  const termId = titles.onScreenByProject[selected];
  if (!termId || !hasInteractivePaneSession(termId)) return;
  toggleMiniView({ termId, project: selected, label: titles.byProject[selected]?.[termId] ?? "Terminal" });
}

/** The main window's mini views, in its bottom-right corner above the composer
 *  and footer. A view hides while its own tab is on screen. */
export function MiniViewHost() {
  const views = useMiniViews((s) => s.views);
  const onScreen = useTerminalTitles((s) => s.onScreenByProject);
  useKeyboardShortcut(MINI_VIEW_CHORD, toggleTabOnScreen);
  const shown = views.filter((v) => onScreen[v.project] !== v.termId);
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-[148px] right-4 z-[35] flex flex-col items-end gap-2">
      {shown.map((view) => (
        <MiniViewCard key={view.termId} view={view} />
      ))}
    </div>
  );
}
