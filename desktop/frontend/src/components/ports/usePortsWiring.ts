import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { useAppStore } from "../../store/app";
import { usePortsFollowProjects } from "./usePortsFollowProjects";
import { usePortsPolling } from "./usePortsPolling";

// The main window's part in the Ports view: ⌘⌥P in and back out, and a slow
// read for the sidebar row's count while the view itself isn't reading faster.
export function usePortsWiring(): void {
  const showing = useAppStore((s) => s.view === "ports");
  const setView = useAppStore((s) => s.setView);
  useKeyboardShortcut({ key: "p", meta: true, alt: true }, () => {
    setView(showing ? "projects" : "ports");
  });
  usePortsPolling(60_000, !showing);
  usePortsFollowProjects();
}
