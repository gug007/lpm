import { usePeersStore } from "../store/peers";
import { useAppStore } from "../store/app";

// Connected peer Macs and their projects, rendered below the local project list.
// Remote projects are intentionally kept out of local groups/folders — this is a
// separate, read-only surface. Shown only for peers currently connected.
export function RemoteSidebarSection() {
  const peers = usePeersStore((s) => s.peers);
  const projectsByPeer = usePeersStore((s) => s.projectsByPeer);
  const selection = usePeersStore((s) => s.selection);
  const selectRemoteProject = usePeersStore((s) => s.selectRemoteProject);
  const clearLocalSelection = useAppStore((s) => s.clearSelection);

  const connected = peers.filter((p) => p.status === "connected");
  if (connected.length === 0) return null;

  const open = (peerId: string, project: string) => {
    selectRemoteProject(peerId, project);
    clearLocalSelection();
  };

  return (
    <div className="mt-4">
      {connected.map((peer) => {
        const projects = projectsByPeer[peer.id] ?? [];
        return (
          <div key={peer.id} className="mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-green)]" />
              <span className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {peer.name}
              </span>
            </div>
            {projects.length === 0 ? (
              <p className="px-3 py-1 text-[11px] text-[var(--text-muted)]">No projects</p>
            ) : (
              projects.map((project) => {
                const active = selection?.peerId === peer.id && selection.project === project.name;
                return (
                  <button
                    key={project.name}
                    onClick={() => open(peer.id, project.name)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: project.running ? "var(--accent-green)" : "var(--text-muted)",
                      }}
                    />
                    <span className="truncate">{project.label || project.name}</span>
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
