const FLASH_MS = 1500;
// The page holding the row may still be drawing when this is asked.
const MAX_FRAMES = 30;

// Scrolls to a Settings row and flashes it, as a search result does, once the
// page it is on has drawn.
export function revealSettingsRow(id: string): void {
  let frames = 0;
  const look = () => {
    const el = document.querySelector<HTMLElement>(`[data-settings-row="${id}"]`);
    if (!el) {
      if (++frames < MAX_FRAMES) requestAnimationFrame(look);
      return;
    }
    const fold = el.closest("details");
    if (fold) fold.open = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("settings-search-flash");
    window.setTimeout(() => el.classList.remove("settings-search-flash"), FLASH_MS);
  };
  requestAnimationFrame(look);
}
