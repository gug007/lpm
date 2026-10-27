import { FolderSync, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MACHINE } from "../../machineWords";
import { toast } from "../../notifications/toast";
import { useAppStore } from "../../store/app";
import { Modal } from "../ui/Modal";
import { IgnoredSyncDone } from "./IgnoredSyncDone";
import { IgnoredSyncEnds } from "./IgnoredSyncEnds";
import { IgnoredSyncFooter } from "./IgnoredSyncFooter";
import { IgnoredSyncHeavyNote } from "./IgnoredSyncHeavyNote";
import { IgnoredSyncProgress } from "./IgnoredSyncProgress";
import { IgnoredSyncToolbar } from "./IgnoredSyncToolbar";
import { IgnoredTreeList } from "./IgnoredTreeList";
import { selectedPaths } from "./ignoredSelection";
import { forgetList, syncPaths, undoSync, type Prefer } from "./ignoredSyncApi";
import type { IgnoredSyncRequest } from "./ignoredSyncStore";
import { buildTree, totalsOf, visibleRows, type TreeNode, type View } from "./ignoredTree";
import { listNames, putBack } from "./syncWords";
import { useIgnoredChoice } from "./useIgnoredChoice";
import { useIgnoredListings } from "./useIgnoredListings";
import { useSyncMachines } from "./useSyncMachines";
import { useSyncRun } from "./useSyncRun";

interface IgnoredSyncDialogProps {
  request: IgnoredSyncRequest;
  onClose: () => void;
}

// Sync Ignored Files: the ignored files of this computer and the others that
// hold the project as one tree, ticked by folder, subfolder or file. What is
// ticked stays the same on every computer ticked at the top.
export function IgnoredSyncDialog({ request, onClose }: IgnoredSyncDialogProps) {
  const { pairs } = request;
  const project = pairs[0].project;
  const [preferred, setPrefer] = useState<Prefer>("newest");
  const [query, setQuery] = useState("");
  const [comparing, setComparing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [undoing, setUndoing] = useState(false);
  const localRoot = useAppStore((s) => s.projects.find((p) => p.name === project)?.root ?? "");

  const machines = useSyncMachines(pairs);
  const listings = useIgnoredListings(project, pairs);
  const otherRepo = useMemo(
    () => new Set(pairs.filter((p) => listings.root?.sameRepo[p.slug] === false).map((p) => p.slug)),
    [pairs, listings.root],
  );
  const active = useMemo(
    () => pairs.filter((p) => machines.chosen.has(p.slug) && !otherRepo.has(p.slug)),
    [pairs, machines.chosen, otherRepo],
  );
  const activeKey = active.map((p) => p.slug).join(",");
  const tree = useMemo(
    () =>
      listings.root && machines.saved
        ? buildTree(listings.root, listings.loaded, activeKey ? activeKey.split(",") : [])
        : null,
    [listings.root, listings.loaded, machines.saved, activeKey],
  );
  const lists = useMemo(() => pairs.filter((p) => machines.saved?.[p.slug]), [pairs, machines.saved]);
  const savedPaths = useMemo(() => {
    const all = lists.flatMap((p) => machines.saved?.[p.slug]?.paths ?? []);
    return all.length ? [...new Set(all)] : null;
  }, [lists, machines.saved]);
  const choice = useIgnoredChoice(tree, savedPaths, request.focus, listings.loadDir);
  const view = useMemo<View>(
    () => ({
      here: MACHINE.ThisMachineTitle,
      peers: active.map((p) => ({ slug: p.slug, name: p.machine })),
      conflicts: new Map(active.flatMap((p) => (machines.saved?.[p.slug]?.conflicts ?? []).map((c) => [c, p.machine]))),
    }),
    [active, machines.saved],
  );
  const prefer = preferred === "newest" || preferred === "here" || activeKey.split(",").includes(preferred) ? preferred : "newest";
  const run = useSyncRun(setError);
  const paths = useMemo(() => selectedPaths(choice.sel), [choice.sel]);
  const totals = useMemo(() => (tree ? totalsOf(tree, choice.sel, view) : null), [tree, choice.sel, view]);
  const rows = useMemo(() => (tree ? visibleRows(tree, choice.open, query) : []), [tree, choice.open, query]);
  const unchanged =
    active.length > 0 &&
    lists.length === active.length &&
    active.every((p) => {
      const saved = machines.saved?.[p.slug];
      return !!saved?.keep && saved.paths.length === paths.length && saved.paths.every((s) => choice.sel.has(s));
    });
  const otherNames = pairs.filter((p) => otherRepo.has(p.slug)).map((p) => p.machine);
  const listingError = [listings.root?.here, ...active.map((p) => listings.root?.there[p.slug])].find((l) => l?.error)?.error;
  const problem =
    error ||
    (otherNames.length
      ? `${project} on ${listNames(otherNames)} is a different repository, so nothing syncs with ${otherNames.length > 1 ? "them" : "it"}.`
      : "") ||
    listingError;

  const toggleOpen = (node: TreeNode) => {
    const opening = !choice.open.has(node.path);
    if (opening && node.ignored && node.dir && node.children === null) listings.loadDir(node.path);
    choice.setOpen(node.path, opening);
  };

  const sync = async () => {
    setError("");
    try {
      await Promise.all(lists.filter((p) => !active.includes(p)).map(forgetList));
    } catch (err) {
      setError(String(err));
      return;
    }
    void run.start((id, watch) => syncPaths(id, project, active, paths, prefer, watch));
  };

  const stop = async () => {
    try {
      await Promise.all(lists.map(forgetList));
      toast(`Stopped syncing ignored files with ${listNames(lists.map((p) => p.machine))}`, {
        description: "Every computer keeps the copies it has.",
      });
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const undo = async () => {
    if (!run.done?.batches?.length) return;
    setUndoing(true);
    try {
      const { restored, paused } = await undoSync(project, run.done.batches);
      toast.success(putBack(restored, active.length > 1 ? "every computer" : "both computers"), {
        description: paused ? "Syncing them is paused, so they aren't copied back." : undefined,
      });
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUndoing(false);
    }
  };

  const requestClose = () => (run.progress ? run.cancel() : onClose());

  return (
    <Modal
      open
      onClose={requestClose}
      contentClassName="flex h-[min(900px,92vh)] w-[min(820px,94vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex shrink-0 items-start gap-3 px-6 pb-3.5 pt-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan-text)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <FolderSync size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">Sync ignored files</h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            <span className="font-mono text-[var(--text-secondary)]">{project}</span> · ticked folders and files stay
            the same on {pairs.length > 1 ? "every computer ticked" : "both computers"}
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="-mr-1 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <IgnoredSyncEnds
        here={view.here}
        localRoot={localRoot}
        pairs={pairs}
        chosen={machines.chosen}
        otherRepo={otherRepo}
        disabled={!!run.progress || !!run.done}
        onChoose={machines.choose}
      />

      {run.progress ? (
        <IgnoredSyncProgress progress={run.progress} several={active.length > 1} onCancel={run.cancel} />
      ) : run.done ? (
        <IgnoredSyncDone
          done={run.done}
          paths={paths}
          here={view.here}
          peers={active.map((p) => p.machine)}
          undoing={undoing}
          onUndo={() => void undo()}
          onDone={onClose}
        />
      ) : !tree || !totals ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border-t border-[var(--border)] px-12 text-center">
          {listings.error ? (
            <>
              <p className="text-[12.5px] text-[var(--accent-red-text)]">{listings.error}</p>
              <button
                type="button"
                onClick={listings.reload}
                className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Try again
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              Reading what git ignores on {pairs.length > 1 ? "each computer" : "both computers"}…
            </div>
          )}
        </div>
      ) : (
        <>
          <IgnoredSyncToolbar
            query={query}
            onQuery={setQuery}
            onSuggested={choice.suggest}
            onEnvFiles={choice.addEnvFiles}
            onNone={choice.clear}
            onCollapse={() => {
              setQuery("");
              choice.collapseAll();
            }}
          />
          <div className="min-h-0 flex-1 overflow-auto border-t border-[var(--border)] py-1.5">
            <IgnoredTreeList
              pairs={active}
              rows={rows}
              sel={choice.sel}
              view={view}
              prefer={prefer}
              loadingDirs={listings.loadingDirs}
              comparing={comparing}
              query={query}
              onToggleOpen={toggleOpen}
              onToggleTick={choice.tick}
              onCompare={setComparing}
            />
            <div className="px-6 pt-2.5 text-[11.5px] text-[var(--text-muted)]">System files like .DS_Store never sync.</div>
          </div>
          {problem && (
            <div className="mx-6 mt-2.5 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2 text-[12px] leading-snug text-[var(--accent-red-text)]">
              {problem}
            </div>
          )}
          <IgnoredSyncHeavyNote totals={totals} />
          <IgnoredSyncFooter
            here={view.here}
            peers={view.peers}
            totals={totals}
            paths={paths.length}
            syncing={lists.map((p) => p.machine)}
            paused={lists.some((p) => !machines.saved?.[p.slug]?.keep)}
            unchanged={unchanged}
            prefer={prefer}
            onPrefer={setPrefer}
            onStop={() => void stop()}
            onCancel={onClose}
            onSync={() => void sync()}
          />
        </>
      )}
    </Modal>
  );
}
