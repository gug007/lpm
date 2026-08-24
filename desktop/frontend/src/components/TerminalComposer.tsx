import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { toast } from "sonner";
import {
  DeleteMemorySession,
  GetServiceLogs,
  NotesReadFileAsInput,
  ReadClipboardFiles,
  RemoteSetComposerDraft,
  RenameMemorySession,
  SaveClipboardImage,
  TransformText,
  UploadAndQuoteForTerminal,
  UploadClipboardImageForTerminal,
} from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { peerSlugOf, PEER_IMAGE_MAX_BYTES } from "../peer/markers";
import { useAIPicker } from "../hooks/useAIPicker";
import { getSettings } from "../store/settings";
import {
  useEnabledComposerActions,
  type ComposerAction,
} from "../store/composerActions";
import { generateVariants, resolveTransformParams } from "../composerVariants";
import { isCanceledError, useAIGeneration } from "../hooks/useAIGeneration";
import { ComposerActionsButton } from "./ComposerActionsButton";
import { ComposerActionsModal } from "./ComposerActionsModal";
import { ComposerVariantsModal } from "./ComposerVariantsModal";
import { ComposerMicButton } from "./ComposerMicButton";
import { ComposerMemoryButton } from "./ComposerMemoryButton";
import {
  createInputTab,
  loadComposerDraft,
  saveComposerDraft,
  subscribeRemoteDraft,
  type ComposerHistoryEntry,
  type ComposerInputTab,
} from "../store/composerDrafts";
import { stepRecall } from "./composerRecall";
import { COLLECTION_DRAFTS, recordMessage, saveDraft } from "../store/messageHistory";
import { ComposerTabStrip, type ComposerTabView } from "./ComposerTabStrip";
import { SendSplitButton } from "./SendSplitButton";
import { AgentStatusChip } from "./AgentStatusChip";
import type { PaneAgentStatus } from "../hooks/usePaneStatus";
import type { DuplicatePromptSeed } from "./BulkDuplicateDialog";
import { PlusIcon, SquarePenIcon } from "./icons";
import { ImagePreviewPopover } from "./ImagePreviewPopover";
import { MemoryPreviewPopover } from "./MemoryPreviewPopover";
import { ImageLightbox } from "./ImageLightbox";
import { loadImageDataUrl, seedImageDataUrl } from "./imageDataUrl";
import { TerminalHistoryButton } from "./TerminalHistoryButton";
import { TerminalDropOverlay } from "./terminal/TerminalDropOverlay";
import { TERMINAL_FONT_FAMILY } from "./terminal-utils";
import { Tooltip } from "./ui/Tooltip";
import { basename } from "../path";
import { quoteImagePathForPaste } from "../composerValue";
import { composerPlaceholder, COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import {
  caretEdges,
  caretInside,
  caretOffsetInSerialized,
  chipAfterCaret,
  chipBeforeCaret,
  createImageChip,
  highlightCommand,
  insertItemsAtCaret,
  insertTextAtCaret,
  isEditorEmpty,
  isImagePath,
  lineBeforeCaret,
  normalizeComposer,
  payloadToItems,
  placeCaretAtEnd,
  placeCaretAtSerializedOffset,
  placeCaretFromPoint,
  presentImageTokens,
  removeChip,
  renderFileChip,
  replaceArgFragment,
  replaceMentionFragment,
  replaceMentionFragmentWith,
  replaceSlashFragment,
  restoreTrailingChipCaret,
  selectChip,
  selectedChip,
  selectionClipboardPayload,
  serializeEditor,
  setChipThumbnail,
  setEditorContent,
  splitByImageTokens,
  type ComposerImage,
} from "./composerEditor";
import {
  readClipboardPayload,
  writeClipboardPayload,
} from "./composerClipboard";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { detectAICLI, HINT_TRIGGER, SLASH_TRIGGER, type SlashCommand } from "../slashCommands";
import { MentionMenu } from "./MentionMenu";
import { captureInteractivePaneLog } from "./InteractivePane";
import { useMentions } from "../hooks/useMentions";
import { useMemorySessions } from "../hooks/useMemorySessions";
import { MENTION_TRIGGER, rankMentions, type MentionItem } from "../mentions";
import type { TerminalMemoryRef } from "../terminalMemory";

interface TerminalComposerProps {
  // Terminal whose draft this composer owns; its draft is persisted per id.
  terminalId: string;
  // Stable per-terminal id used to scope message history. The live terminalId
  // changes across restarts, so history is keyed by this instead — otherwise it
  // would fall back to matching by label and bleed across terminals.
  historyKey: string;
  // Project the target terminal belongs to; tags each sent message in history.
  projectName: string;
  // Whether the composer is actually on screen (false while glancing at a
  // service/browser tab, or while another project is selected). A hidden→shown
  // transition refocuses the input.
  shown: boolean;
  // Whether this composer's pane is the focused one. Only the focused pane's
  // input grabs keyboard focus — otherwise every pane's composer would fight
  // over focus on mount / project switch-back.
  focused: boolean;
  // Label of the terminal that will receive the input.
  targetLabel: string;
  // Every terminal tab in the project ({id,label}), so the "@" menu can offer
  // any one's logs — not just this composer's own terminal.
  terminals: { id: string; label: string }[];
  // Working directory the AI CLI runs in when applying a composer action.
  cwd: string;
  // The target terminal's launch command, if any. Its leading binary tells us
  // which AI CLI is running there (e.g. "claude …" / "codex …"), which scopes the
  // "/" slash-command autocomplete. Absent / unrecognized keeps the menu off.
  launchCmd?: string;
  // Name of the project action this terminal was launched from, if any. Lets
  // "run in duplicates" run that same action on each copy instead of replaying
  // the resolved launch command (which may carry a one-off session id).
  actionName?: string;
  // Terminal font size; the composer text scales to match it.
  fontSize: number;
  // What the agent in the target terminal is doing, and since when — null when
  // it reports nothing. Read out in the button row, the one surface that is
  // always on screen while you wait for the terminal it belongs to.
  agentStatus?: PaneAgentStatus | null;
  // Returns false when the input could not be delivered (e.g. a dead session),
  // so the draft is kept rather than cleared. An array carries ordered segments
  // (text runs and image paths) to be delivered as separate pastes.
  onSubmit: (input: string | string[]) => boolean;
  onFocusTerminal: () => void;
  // Hand the current prompt off to the "run in duplicates" flow. The host opens
  // the seeded Duplicate dialog for the seed's copies and, on confirm, calls
  // `runHere` to run the same prompt in this terminal as copy #1 — so the
  // current project and every copy run it in parallel.
  onRunInDuplicates: (seed: DuplicatePromptSeed, runHere: () => Promise<void>) => void;
  // Show a saved session in the Memory tab instead of inserting its invocation.
  onOpenMemorySession: (sessionId: string) => void;
  // The memory session this terminal was last handed, if any — what lights the
  // memory button up. Absent `session` means the agent hasn't named it yet.
  memory?: TerminalMemoryRef;
  // Stop marking this terminal as working under a memory session. Only clears
  // lpm's own indicator; the agent keeps whatever it was told.
  onDetachMemory: () => void;
}

// How many trailing lines of a service's pane to pull into the draft when its
// "@" mention is picked — enough to carry a stack trace, capped so a chatty
// service can't bury the prompt (or the agent's context).
const MENTION_LOG_LINES = 200;

const UNDO_COALESCE_MS = 350;
const UNDO_LIMIT = 200;

interface UndoSnapshot {
  text: string;
  images: Record<string, string>;
  caret: number | null;
}

// "/lpm-memory " (Claude) or "$lpm-memory " (Codex skill mention) with a
// partial session id at the caret — completes the invocation's argument from
// the project's memory sessions. The invocation can sit anywhere in the prompt
// (see SLASH_TRIGGER), so the same boundary rule applies here.
const MEMORY_ARG_TRIGGER = /(?:^|[\s￼])[/$]lpm-memory[ \t]+([a-z0-9-]*)$/i;

// A short, single-line label for a prompt tab: its text with attachment tokens
// dropped, collapsed whitespace. With no text, name the draft by its attachment —
// a file's basename, or "Image" for an image (the token alone can't tell them
// apart, so the path map decides). Empty when the draft holds nothing visible.
function previewLabel(text: string, attachments: Map<number, string>): string {
  const segments = splitByImageTokens(text);
  const textOnly = segments
    .filter((s) => s.image === null)
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (textOnly) return textOnly;
  for (const s of segments) {
    if (s.image === null) continue;
    const path = attachments.get(s.image);
    if (path && !isImagePath(path)) return basename(path);
  }
  return segments.some((s) => s.image !== null) ? "Image" : "";
}

function sameTabView(a: ComposerTabView[], b: ComposerTabView[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t.id === b[i].id && t.label === b[i].label);
}

export function TerminalComposer({ terminalId, historyKey, projectName, shown, focused, targetLabel, terminals, cwd, launchCmd, actionName, fontSize, agentStatus, onSubmit, onFocusTerminal, onRunInDuplicates, onOpenMemorySession, memory, onDetachMemory }: TerminalComposerProps) {
  // A remote (peer) terminal runs on another machine. Images are still supported:
  // they're uploaded to the host (which returns a host-valid path) at attach time
  // via UploadClipboardImageForTerminal; other file types stay unsupported. The
  // slug carries into every later read of those host paths — chip thumbnails, the
  // hover preview, the lightbox — since the host is the only machine they exist on.
  const peerSlug = peerSlugOf(terminalId);
  const isRemotePeer = peerSlug !== null;
  // The input reads better slightly larger than the terminal text it feeds.
  const inputFontSize = fontSize + 2;
  // `blank` drives the placeholder (no content at all); `disabled` drives the
  // send button (nothing but whitespace).
  const [blank, setBlank] = useState(true);
  const [disabled, setDisabled] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<
    | { kind: "image"; path: string; rect: DOMRect }
    | { kind: "memory"; id: string; rect: DOMRect }
    | null
  >(null);
  // Local path of the image shown full-window in the lightbox, or null when closed.
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);
  // The composer action currently being applied (drives the busy UI), or null.
  const [transformingId, setTransformingId] = useState<string | null>(null);
  const gen = useAIGeneration();
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  // Set while the multi-result variant picker is open. `startedId` pins the tab
  // the rewrites belong to, and `images` rehydrates whichever one is committed.
  const [variants, setVariants] = useState<{
    label: string;
    list: string[];
    images: Record<string, string>;
    startedId: string;
  } | null>(null);
  // Slash-command autocomplete: open state, highlighted row, the filtered list,
  // and the caret rect the popover anchors to.
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashItems, setSlashItems] = useState<SlashCommand[]>([]);
  const [slashRect, setSlashRect] = useState<DOMRect | null>(null);
  // "@" mention autocomplete (projects, duplicates, and files under the
  // terminal's cwd): open state, highlighted row, the filtered list, and the
  // caret rect the popover anchors to.
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionRect, setMentionRect] = useState<DOMRect | null>(null);
  // What the open mention menu completes: an "@" reference, the session-id
  // argument of "/lpm-memory", or a session drilled into from the "@" menu's
  // Memory group row. Same menu, keyboard nav, and anchor in every mode.
  const [mentionMode, setMentionMode] = useState<"at" | "cmdArg" | "memoryPick">("at");
  // Ghost argument-hint shown after a completed "/command "; positioned at the
  // caret (and sized to the caret's line height so it sits on the text baseline),
  // relative to the composer box.
  const [hint, setHint] = useState<{ text: string; left: number; top: number; height: number } | null>(null);
  // Guards runAction/send against re-entry across the AI await without waiting
  // for the transformingId state to settle.
  const transforming = useRef(false);
  const ai = useAIPicker(shown);
  const enabledActions = useEnabledComposerActions();
  // The CLI running in the target terminal, derived from its launch command. The
  // slash menu only appears when this resolves (a terminal actually running an
  // agent); plain shells get no menu. Commands load lazily on focus.
  const slashCli = detectAICLI(launchCmd);
  const { filter: filterSlash, isCommand: isSlashCommand, argumentHintFor } = useSlashCommands(slashCli, cwd, focused);
  // "@" mentions work in every terminal composer, not just agent terminals — the
  // referenced text is useful to any CLI. They load only while the composer is
  // focused, so a background tab still pays nothing for the tree walk / git call.
  const {
    items: memorySessions,
    byId: memorySessionById,
    enabled: memoryAvailable,
    reload: reloadMemorySessions,
  } = useMemorySessions(projectName, focused);
  const memorySessionIds = useMemo(
    () => new Set(memorySessions.map((s) => s.insert)),
    [memorySessions],
  );
  // The memory submenu: a save-this-conversation action first (empty insert =
  // the bare invocation, which the skill treats as "record work done so far"),
  // then the sessions to continue. The cmdArg completion keeps using the plain
  // session list — an argument slot has no use for the save action.
  const memoryMenuItems = useMemo<MentionItem[]>(
    () => [
      {
        kind: "memory-save",
        label: "Remember this conversation",
        insert: "",
      },
      ...memorySessions,
    ],
    [memorySessions],
  );
  // Memory rides the "@" pool as one drill-in group row for every local
  // project's composer — NOT gated on CLI detection, since agents are often
  // launched by typing `claude`/`codex` into a plain terminal, where startCmd
  // reveals nothing. The insertion picks the form from what IS known: "/" for
  // a detected Claude terminal, the "$" skill mention otherwise.
  const memoryMentionItems = useMemo<MentionItem[]>(
    () =>
      memoryAvailable
        ? [
            {
              kind: "memory-group",
              label: "Memory",
              insert: "memory",
              detail:
                memorySessions.length > 0
                  ? `${memorySessions.length} session${memorySessions.length === 1 ? "" : "s"} ›`
                  : "›",
            },
          ]
        : [],
    [memoryAvailable, memorySessions],
  );
  const { filter: filterMentions, refresh: refreshMentions } = useMentions(cwd, projectName, terminals, terminalId, focused, memoryMentionItems);
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverChip = useRef<HTMLElement | null>(null);
  const history = useRef<ComposerHistoryEntry[]>([]);
  // Open prompt tabs and the id of the one currently in the editor. The active
  // tab's editing state lives in the refs below (and the editor DOM); the others
  // hold their serialized snapshot until switched to.
  const tabs = useRef<ComposerInputTab[]>([]);
  const activeId = useRef("");
  // Reactive mirror of `tabs`/`activeId` that drives the tab strip. Labels are
  // only filled while the strip is shown (2+ tabs) so single-tab typing — the
  // common case — never re-renders this component (see refreshTabView).
  const [tabView, setTabView] = useState<ComposerTabView[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  // -1 means "the live draft"; 0..n-1 index into history, newest first.
  const histIdx = useRef(-1);
  // The draft recall stepped off, held until the cursor returns to -1.
  const histStash = useRef<ComposerHistoryEntry | null>(null);
  // [Image #N] index -> local file path, swapped back in when the draft is sent.
  const imagePaths = useRef<Map<number, string>>(new Map());
  const imgCounter = useRef(0);
  const normalizePending = useRef(false);
  // Prompt ids whose send is mid-flight (image upload). Guards send() against
  // re-entry so a second Enter on the same tab can't double-deliver it, while
  // still letting a different prepared prompt be sent in the meantime.
  const sending = useRef<Set<string>>(new Set());
  // Native undo is unreliable here — every keystroke also runs normalizeComposer/
  // highlightCommand, mutating the DOM outside WebKit's undo stack — so undo runs
  // on these snapshot stacks instead. undoBase is the state the live edits diverge
  // from; the stacks hold the committed steps on either side of it.
  const undoStack = useRef<UndoSnapshot[]>([]);
  const redoStack = useRef<UndoSnapshot[]>([]);
  const undoBase = useRef<UndoSnapshot | null>(null);
  const commitTimer = useRef<number | null>(null);
  // Read by the show effect (keyed on `shown`) so it doesn't re-run on focus
  // changes — clicking a pane's terminal must not steal focus into its input.
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // Bidirectional draft sync with a paired phone. The active tab's text is pushed
  // (debounced) to the Mac hub, which fans it out; an inbound phone-typed draft is
  // written back into the editor. `lastRemoteApplied` suppresses the echo of a
  // draft we just applied, and `lastLocalEditAt` lets a locally-typing user win
  // over a racing remote apply.
  const remoteDraftTimer = useRef<number | null>(null);
  const pendingRemoteDraft = useRef<string | null>(null);
  const lastRemoteApplied = useRef<string | null>(null);
  const lastLocalEditAt = useRef(0);
  const flushRemoteDraft = useCallback(() => {
    if (remoteDraftTimer.current !== null) {
      clearTimeout(remoteDraftTimer.current);
      remoteDraftTimer.current = null;
    }
    const text = pendingRemoteDraft.current;
    if (text === null) return;
    pendingRemoteDraft.current = null;
    void RemoteSetComposerDraft(terminalId, text).catch(() => {});
  }, [terminalId]);
  const pushRemoteDraft = useCallback(
    (text: string) => {
      if (isRemotePeer) return;
      if (text === lastRemoteApplied.current) return;
      lastLocalEditAt.current = Date.now();
      pendingRemoteDraft.current = text;
      if (remoteDraftTimer.current !== null) clearTimeout(remoteDraftTimer.current);
      remoteDraftTimer.current = window.setTimeout(flushRemoteDraft, 250);
    },
    [isRemotePeer, flushRemoteDraft],
  );

  // Give each attachment chip its resting look (lazily). An image chip loads its
  // thumbnail from the shared cache; any other file is re-skinned to a filename +
  // type glyph. A chip is marked once handled (`thumb`) so repeated syncState
  // calls are cheap; a thumbnail load that fails leaves the placeholder glyph and
  // isn't retried. Fresh drops are styled at registerImagePath; this covers chips
  // rebuilt from a draft/history token, which only carry their path here.
  const hydrateChips = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>("[data-img]").forEach((chip) => {
      if (chip.dataset.thumb) return;
      const path = imagePaths.current.get(Number(chip.dataset.img));
      if (!path) return;
      if (!isImagePath(path)) {
        chip.dataset.thumb = "file";
        renderFileChip(chip, path);
        return;
      }
      chip.dataset.thumb = "pending";
      loadImageDataUrl(path, peerSlug)
        .then((url) => {
          if (chip.isConnected) setChipThumbnail(chip, url);
        })
        .catch(() => {
          chip.dataset.thumb = "failed";
        });
    });
  }, [peerSlug]);

  // Push the current tab set into the reactive mirror. Labels are computed only
  // when the strip is visible (2+ tabs); a lone tab carries an empty label so its
  // per-keystroke text changes never produce a new view and never re-render.
  const refreshTabView = useCallback(() => {
    const list = tabs.current;
    const multi = list.length > 1;
    const next = list.map((t) => ({ id: t.id, label: multi ? previewLabel(t.text, t.imagePaths) : "" }));
    setTabView((prev) => (sameTabView(prev, next) ? prev : next));
    setActiveTabId(activeId.current);
  }, []);

  // Swap a stored tab into the live editor + refs, making it the active one.
  const loadTab = useCallback((tab: ComposerInputTab) => {
    const editor = editorRef.current;
    if (!editor) return;
    imagePaths.current = new Map(tab.imagePaths);
    imgCounter.current = tab.imgCounter;
    histIdx.current = tab.histIdx;
    histStash.current = tab.stash;
    activeId.current = tab.id;
    setEditorContent(editor, tab.text);
    setBlank(isEditorEmpty(editor));
    setDisabled(serializeEditor(editor).trim() === "");
    setPreview(null);
    placeCaretAtEnd(editor);
    hydrateChips();
  }, [hydrateChips]);

  // Restore this terminal's saved draft on mount (the composer is remounted per
  // terminal), then focus it — so switching terminals brings back what you'd
  // typed and puts the cursor in the input. useLayoutEffect so the restored text
  // is painted in one frame (no empty-with-placeholder flash).
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const draft = loadComposerDraft(terminalId, historyKey);
    if (draft && draft.tabs.length > 0) {
      tabs.current = draft.tabs;
      history.current = draft.history.slice();
      const active = draft.tabs.find((t) => t.id === draft.activeTabId) ?? draft.tabs[0];
      loadTab(active);
    } else {
      const tab = createInputTab();
      tabs.current = [tab];
      activeId.current = tab.id;
    }
    refreshTabView();
    if (focused) editor.focus();
    // Mount-only: the composer is keyed by terminalId, so a new terminal == a
    // fresh mount; terminalId never changes within one instance.
  }, []);

  // Re-show after a glance at a service/browser tab or a switch to another
  // project (no remount, since the composer stays pinned to the last terminal)
  // should refocus the input too.
  const wasShown = useRef(shown);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor && shown && !wasShown.current && focusedRef.current) {
      editor.focus();
      placeCaretAtEnd(editor);
    }
    wasShown.current = shown;
  }, [shown]);

  useEffect(() => {
    return () => {
      if (remoteDraftTimer.current !== null) clearTimeout(remoteDraftTimer.current);
    };
  }, []);

  const dismissPreview = useCallback(() => {
    hoverChip.current = null;
    setPreview(null);
  }, []);

  // The popover is anchored to a rect captured at hover time, so anything that
  // moves the chip without a re-hover (window resize, or a composer relayout
  // from a pane-splitter drag / field growth that a ResizeObserver catches but
  // a window resize event does not) would leave it floating. Dismiss on both.
  useEffect(() => {
    if (!preview) return;
    window.addEventListener("resize", dismissPreview);
    let primed = false;
    const ro = new ResizeObserver(() => (primed ? dismissPreview() : (primed = true)));
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", dismissPreview);
      ro.disconnect();
    };
  }, [preview, dismissPreview]);

  // Recompute the placeholder/disabled state and forget image paths whose chip
  // has been deleted, so the map never outlives what's actually in the field.
  // `prunePaths` is false only for a cut, whose removed chip must keep its path
  // alive so pasting its "[Image #N]" token back rebuilds the image.
  const syncState = useCallback((prunePaths = true) => {
    const editor = editorRef.current;
    if (!editor) return;
    const value = serializeEditor(editor);
    const blankNow = isEditorEmpty(editor);
    setBlank(blankNow);
    setDisabled(value.trim() === "");
    // An empty field can't be a completed "/command " line, so drop any lingering
    // ghost argument-hint. Without this a programmatic clear (send, recall-to-empty)
    // leaves the hint painted over the reappearing placeholder.
    if (blankNow) setHint(null);
    if (prunePaths) {
      const present = presentImageTokens(editor);
      for (const n of imagePaths.current.keys()) {
        if (!present.has(n)) imagePaths.current.delete(n);
      }
    }
    // Any deletion path (keyboard, select+delete, cut, send) ends here; if the
    // hovered chip is gone, drop its now-orphaned preview.
    if (hoverChip.current && !hoverChip.current.isConnected) {
      hoverChip.current = null;
      setPreview(null);
    }
    // Mirror the live editor into the active tab, then persist the whole draft so
    // every prepared prompt survives a terminal switch.
    const active = tabs.current.find((t) => t.id === activeId.current);
    if (active) {
      active.text = value;
      active.imagePaths = new Map(imagePaths.current);
      active.imgCounter = imgCounter.current;
      active.histIdx = histIdx.current;
      active.stash = histStash.current;
    }
    saveComposerDraft(
      terminalId,
      {
        tabs: tabs.current,
        activeTabId: activeId.current,
        history: history.current,
      },
      historyKey,
    );
    // Mirror the active tab's text to a paired phone (debounced; suppressed when it
    // matches a draft we just applied from the phone, to avoid a feedback loop).
    pushRemoteDraft(value);
    refreshTabView();
    hydrateChips();
  }, [terminalId, historyKey, refreshTabView, hydrateChips, pushRemoteDraft]);

  // Apply an inbound remote draft (typed on the phone) to the live editor. Dropped
  // when the user is actively typing here (focused and edited within 1.5s) so the
  // local typist wins; otherwise the text is swapped in and the caret parked at the
  // end. syncState re-parks the draft; its push is suppressed by lastRemoteApplied.
  useEffect(() => {
    return subscribeRemoteDraft(terminalId, (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const focusedHere = document.activeElement === editor;
      if (focusedHere && Date.now() - lastLocalEditAt.current < 1500) return;
      if (text === serializeEditor(editor)) {
        lastRemoteApplied.current = text;
        return;
      }
      lastRemoteApplied.current = text;
      setEditorContent(editor, text);
      setPreview(null);
      placeCaretAtEnd(editor);
      syncState();
    });
  }, [terminalId, syncState]);

  // After a caret move, WebKit may have injected stray chars around a chip. Clean
  // them in a rAF (before the next paint, so no flash; coalesced across repeats)
  // rather than reacting to input — caret navigation fires no input event.
  const scheduleNormalize = useCallback(() => {
    if (normalizePending.current) return;
    normalizePending.current = true;
    requestAnimationFrame(() => {
      normalizePending.current = false;
      const editor = editorRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      if (normalizeComposer(editor)) syncState();
    });
  }, [syncState]);

  // Switch the editor to another prepared prompt. syncState() first commits the
  // visible tab's edits so nothing typed is lost on the swap.
  const switchTab = useCallback(
    (id: string) => {
      if (id === activeId.current || transforming.current) return;
      syncState();
      const target = tabs.current.find((t) => t.id === id);
      if (!target) return;
      loadTab(target);
      editorRef.current?.focus();
      syncState();
    },
    [syncState, loadTab],
  );

  // Open a fresh empty prompt and switch to it, parking the current draft in its
  // own tab so the user can prepare several and send them one at a time.
  const addTab = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    syncState();
    const tab = createInputTab();
    tabs.current.push(tab);
    loadTab(tab);
    editor.focus();
    syncState();
  }, [syncState, loadTab]);

  // Drop the tab at `idx`; if it was the visible one, adopt the tab to its left
  // (or the new first tab when the leftmost was closed) so closing walks toward
  // the start of the strip, not the end.
  const removeTabAt = useCallback(
    (idx: number, wasActive: boolean) => {
      tabs.current.splice(idx, 1);
      if (wasActive) loadTab(tabs.current[Math.max(0, idx - 1)]);
    },
    [loadTab],
  );

  // Discard a prepared prompt. The last tab can't be closed (the strip hides at
  // one tab). Closing the active tab moves to its neighbor and pulls focus;
  // closing a background tab leaves the editor (and whatever owns focus) untouched.
  const closeTab = useCallback(
    (id: string) => {
      if (tabs.current.length <= 1 || transforming.current) return;
      const idx = tabs.current.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const wasActive = id === activeId.current;
      removeTabAt(idx, wasActive);
      if (wasActive) editorRef.current?.focus();
      syncState();
    },
    [syncState, removeTabAt],
  );

  // Apply a drag-reorder from the strip: rebuild `tabs.current` in the given id
  // order, then persist. The active tab is tracked by id, so reordering never
  // changes which prompt is in the editor — only the row order moves.
  const reorderTabs = useCallback(
    (ids: string[]) => {
      const byId = new Map(tabs.current.map((t) => [t.id, t]));
      const next = ids.map((id) => byId.get(id)).filter((t): t is ComposerInputTab => !!t);
      if (next.length !== tabs.current.length) return;
      tabs.current = next;
      syncState();
    },
    [syncState],
  );

  const registerImagePath = useCallback((path: string): HTMLSpanElement => {
    const n = (imgCounter.current += 1);
    imagePaths.current.set(n, path);
    const chip = createImageChip(n);
    if (!isImagePath(path)) renderFileChip(chip, path);
    return chip;
  }, []);

  // Register a chip for an image already uploaded to the host, seating its
  // thumbnail from the bytes we just sent rather than reading the host path back.
  // Seeding the shared cache under that path means every later reader of it — a
  // chip rebuilt on a tab switch, the hover preview, the lightbox — is answered
  // here too, instead of asking the host for pixels this Mac already holds.
  const registerPeerImageChip = useCallback(
    (hostPath: string, dataUrl: string): HTMLSpanElement => {
      const chip = registerImagePath(hostPath);
      chip.dataset.thumb = "data";
      setChipThumbnail(chip, dataUrl);
      seedImageDataUrl(hostPath, peerSlug, dataUrl);
      return chip;
    },
    [registerImagePath, peerSlug],
  );

  // Upload one image (raw bytes + mime) to the host and return its chip, or null
  // on failure/oversize. Shared by pasted/dropped blobs and Finder-path reads.
  const uploadPeerImage = useCallback(
    async (b64: string, mimeType: string, rawBytes: number): Promise<HTMLSpanElement | null> => {
      if (rawBytes > PEER_IMAGE_MAX_BYTES) {
        toast.error("Image too large to send to a remote Mac (max 8 MB)");
        return null;
      }
      try {
        const hostPath = await UploadClipboardImageForTerminal(terminalId, b64, mimeType);
        if (typeof hostPath !== "string" || !hostPath) return null;
        return registerPeerImageChip(hostPath, `data:${mimeType};base64,${b64}`);
      } catch {
        return null;
      }
    },
    [terminalId, registerPeerImageChip],
  );

  const addImageBlob = useCallback(
    async (blob: Blob): Promise<HTMLSpanElement | null> => {
      const b64 = await blobToBase64(blob);
      if (!b64) return null;
      const mime = blob.type || "image/png";
      if (isRemotePeer) return uploadPeerImage(b64, mime, blob.size);
      try {
        const path = await SaveClipboardImage(b64, mime);
        return typeof path === "string" && path ? registerImagePath(path) : null;
      } catch {
        return null;
      }
    },
    [isRemotePeer, uploadPeerImage, registerImagePath],
  );

  // Bracketed in two undo steps (commitUndo touches only refs, so the stale
  // closure is safe): programmatic insertion fires no input event, and without
  // its own step a paste that is then cut nets back to the undo base and ⌘Z
  // has nothing to restore.
  const insertItems = useCallback(
    (items: Array<HTMLElement | string>, separate = true) => {
      const editor = editorRef.current;
      if (!editor || items.length === 0) return;
      commitUndo();
      insertItemsAtCaret(editor, items, separate);
      histIdx.current = -1;
      syncState();
      commitUndo();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commitUndo is ref-only
    [syncState],
  );

  // Insert the chips that resolved and warn about any that didn't, so a failed
  // image save (decode/temp-write error) never vanishes without feedback.
  const insertImageChips = useCallback(
    (chips: Array<HTMLSpanElement | null>, attempted: number) => {
      const ok = chips.filter((c): c is HTMLSpanElement => c !== null);
      insertItems(ok);
      const failed = attempted - ok.length;
      if (failed > 0) toast.error(failed === 1 ? "Couldn't add image" : `Couldn't add ${failed} images`);
    },
    [insertItems],
  );

  // Every dropped/pasted file becomes a chip — an image shows a thumbnail, any
  // other file its name + a type glyph. On send each chip resolves to its path
  // (shell-quoted, and scp-uploaded for a remote pane) via UploadAndQuoteForTerminal,
  // so the path is never pasted in as raw, leakable text.
  const insertFilePaths = useCallback(
    (paths: string[]) => insertItems(paths.map(registerImagePath)),
    [insertItems, registerImagePath],
  );

  // Read client-local image paths (a Finder drop or copied file), upload each to
  // the host, and insert the resulting chips. Non-image files can't be sent to a
  // remote Mac, so they're dropped with a notice rather than silently ignored.
  const addPeerLocalImages = useCallback(
    async (paths: string[]) => {
      const images = paths.filter((p) => isImagePath(p));
      if (images.length < paths.length) {
        toast.error("Only images can be sent to a remote Mac");
      }
      if (images.length === 0) return;
      const chips = await Promise.all(
        images.map(async (path) => {
          try {
            const input = await NotesReadFileAsInput(path);
            const b64 = input?.data;
            if (!b64) return null;
            return uploadPeerImage(b64, input.mimeType || "image/png", base64ByteLength(b64));
          } catch {
            return null;
          }
        }),
      );
      insertImageChips(chips, images.length);
    },
    [uploadPeerImage, insertImageChips],
  );

  const pointInComposer = useCallback((x: number, y: number): boolean => {
    const r = containerRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }, []);

  // Focus the field and seat the caret at the drop point so a dropped image
  // lands where the pointer is. Focus must precede the caret seat — WebKit
  // ignores a programmatic selection on an unfocused field.
  const focusAtPoint = useCallback((x: number, y: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    placeCaretFromPoint(editor, x, y);
  }, []);

  // OS file drops (from Finder) arrive as paths via the shared drop bridge.
  useEffect(() => {
    return registerFileDropHandler("terminal-composer", (x, y, paths) => {
      if (paths.length === 0 || !pointInComposer(x, y)) return false;
      focusAtPoint(x, y);
      if (isRemotePeer) void addPeerLocalImages(paths);
      else insertFilePaths(paths);
      setDragOver(false);
      return true;
    });
  }, [isRemotePeer, addPeerLocalImages, insertFilePaths, pointInComposer, focusAtPoint]);

  // Native (Finder) drags don't raise DOM dragover in the webview — the runtime
  // shim republishes them as app:* events instead — so drive the drop overlay
  // off those, gating `over` behind `enter` to ignore a stale post-drop `over`.
  useEffect(() => {
    let inside = false;
    const onEnter = () => {
      inside = true;
    };
    const onOver = (e: Event) => {
      if (!inside) return;
      const detail = (e as CustomEvent<[number, number]>).detail;
      setDragOver(!!detail && pointInComposer(detail[0], detail[1]));
    };
    const off = () => {
      inside = false;
      setDragOver(false);
    };
    window.addEventListener("app:handleDragEnter", onEnter);
    window.addEventListener("app:handleDragOver", onOver);
    window.addEventListener("app:handleDragLeave", off);
    window.addEventListener("app:filesDropped", off);
    // Backstop the DOM-drag overlay (handleDrop/onDragLeave) against a drag that
    // ends or drops outside the composer without a matching leave event.
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off);
    return () => {
      window.removeEventListener("app:handleDragEnter", onEnter);
      window.removeEventListener("app:handleDragOver", onOver);
      window.removeEventListener("app:handleDragLeave", off);
      window.removeEventListener("app:filesDropped", off);
      window.removeEventListener("dragend", off);
      window.removeEventListener("drop", off);
    };
  }, [pointInComposer]);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const dt = e.clipboardData;
      if (!dt) return;
      // Raw image bytes (e.g. one or more screenshots) — the common case.
      const imageBlobs = Array.from(dt.items)
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((b): b is File => b !== null);
      if (imageBlobs.length > 0) {
        e.preventDefault();
        void Promise.all(imageBlobs.map((b) => addImageBlob(b))).then((chips) =>
          insertImageChips(chips, imageBlobs.length),
        );
        return;
      }
      // Copied files (WebKit often omits the MIME) — resolve real paths. Any file
      // type is accepted; non-image files become named chips like dropped ones.
      if (dt.types.includes("Files") || dt.files.length > 0) {
        e.preventDefault();
        void ReadClipboardFiles()
          .then((paths) => {
            if (!Array.isArray(paths) || paths.length === 0) return;
            if (isRemotePeer) void addPeerLocalImages(paths);
            else insertFilePaths(paths);
          })
          .catch(() => {});
        return;
      }
      // A copy made in any lpm composer this app run resolves to its token→path
      // payload via the copy registry: rebuild text + chips from it (with fresh
      // tokens), so a prompt pastes whole across composers. Checked after real
      // files so a clipboard holding both prefers the actual image bytes.
      const payload = readClipboardPayload(dt);
      if (payload) {
        e.preventDefault();
        insertItems(payloadToItems(payload, registerImagePath), false);
        return;
      }
      // Plain text — insert it verbatim so rich clipboard HTML can't leak markup
      // (or styled chips) into the field. A pasted "[Image #N]" token whose path
      // is still mapped (a cut/copied chip) is rebuilt as the image chip.
      e.preventDefault();
      const text = dt.getData("text/plain");
      if (!text) return;
      const segments = splitByImageTokens(text);
      if (segments.some((s) => s.image !== null && imagePaths.current.has(s.image))) {
        insertItems(
          segments
            .map((s) => (s.image !== null && imagePaths.current.has(s.image) ? createImageChip(s.image) : s.text))
            .filter((it) => typeof it !== "string" || it.length > 0),
          false,
        );
        return;
      }
      document.execCommand("insertText", false, text);
      histIdx.current = -1;
      syncState();
    },
    [addImageBlob, addPeerLocalImages, insertFilePaths, insertImageChips, insertItems, isRemotePeer, registerImagePath, syncState],
  );

  // In-app / web drags deliver File objects through the DOM (OS file drops go
  // through the bridge handler above instead).
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      const { clientX, clientY } = e;
      void Promise.all(files.map((f) => addImageBlob(f))).then((chips) => {
        focusAtPoint(clientX, clientY);
        insertImageChips(chips, files.length);
      });
    },
    [addImageBlob, insertImageChips, focusAtPoint],
  );

  // Retire the just-sent prompt, resolved by id because a tab switch during an
  // image upload can leave it no longer the active one. With "auto close on send"
  // on (the default) a sent prompt drops its tab when others are open — its
  // neighbour takes over — and a lone tab is cleared in place. With it off the
  // tab always stays and is only cleared, so a send never pulls a prepared input
  // out from under the user. Clearing the active prompt empties the live editor
  // (syncState mirrors it back into the tab); an inactive one clears its snapshot.
  const finishSend = (sentId: string, editor: HTMLDivElement) => {
    const idx = tabs.current.findIndex((t) => t.id === sentId);
    const autoClose = getSettings().autoCloseComposerOnSend !== false;
    if (idx !== -1 && autoClose && tabs.current.length > 1) {
      removeTabAt(idx, sentId === activeId.current);
    } else if (idx !== -1) {
      if (sentId === activeId.current) {
        histIdx.current = -1;
        histStash.current = null;
        imagePaths.current.clear();
        setEditorContent(editor, "");
        setPreview(null);
      } else {
        const tab = tabs.current[idx];
        tab.text = "";
        tab.imagePaths = new Map();
        tab.imgCounter = 0;
        tab.histIdx = -1;
        tab.stash = null;
      }
    }
    syncState();
    // A send clears the active tab; push that cleared text to the phone at once
    // rather than waiting out the debounce.
    flushRemoteDraft();
    // Only a send that cleared the active tab in place resets undo here; a tab
    // switch (autoclose, or a background send finishing while the user edits
    // another tab) is covered by the activeTabId effect and must not wipe the
    // undo history of the tab being edited now.
    if (sentId === activeId.current) resetUndo();
    editor.focus();
  };

  // Resolve a message (its serialized text + token→path image map) into what the
  // terminal receives: plain text when there are no images, or an ordered array
  // of text runs and per-image bracketed pastes. Each image path is uploaded
  // (scp'd) for a remote pane and passed through for a local one, kept in
  // segment order and padded so a path-attaching agent keeps order; blank runs
  // between chips are dropped. A literal "[Image #N]" the user typed (no mapped
  // path) rides along as plain text. Shared by live sends and history re-sends.
  const buildTerminalPayload = async (
    text: string,
    images: Record<string, string>,
  ): Promise<string | string[]> => {
    const segments = splitByImageTokens(text);
    const hasImages = segments.some((s) => s.image !== null && images[s.image] !== undefined);
    if (!hasImages) return text;
    const parts = await Promise.all(
      segments.map(async (s) => {
        const path = s.image === null ? undefined : images[s.image];
        if (path === undefined) return s.text;
        // For a peer terminal the path is already host-valid AND already
        // paste-formatted — the host quoted it when the image was uploaded there
        // on attach — so paste it through as-is; quoting again would nest quotes.
        if (isRemotePeer) return ` ${path} `;
        const uploaded = await UploadAndQuoteForTerminal(terminalId, [path]).catch(() => "");
        return ` ${uploaded || quoteImagePathForPaste(path)} `;
      }),
    );
    return parts.filter((p) => p.trim().length > 0);
  };

  // Deliver a prompt (its text + token→local-path image map) to the target
  // terminal and retire the active draft — resolve image pastes, submit, bump
  // the recall ring, record durable history, then clear the field. Shared by the
  // manual ↵ send and the run-in-duplicates "copy #1" send, which fires the same
  // prompt into this terminal while the dialog spins up the extra copies.
  const deliverPrompt = async (text: string, images: Record<string, string>) => {
    const editor = editorRef.current;
    if (!editor) return;
    // The editor stays editable across the upload await, so pin which prompt is
    // being sent now; a concurrent tab switch must not redirect the retire below.
    const sentId = activeId.current;
    // Re-entry guard scoped to this prompt: block a second Enter on the same tab
    // mid-upload, while a different prepared prompt can still be sent.
    if (sending.current.has(sentId)) return;
    sending.current.add(sentId);
    try {
      const payload = await buildTerminalPayload(text, images);
      if (!onSubmit(payload)) return;
      history.current.unshift({ text, images });
      // The prepend shifts every existing entry up by one; nudge each recall
      // cursor (per-tab and the live one) so it stays anchored to its message.
      for (const t of tabs.current) if (t.histIdx >= 0) t.histIdx += 1;
      if (histIdx.current >= 0) histIdx.current += 1;
      recordMessage({
        text,
        projectName,
        terminalId: historyKey,
        terminalLabel: targetLabel,
        images,
      });
      finishSend(sentId, editor);
    } finally {
      sending.current.delete(sentId);
    }
  };

  const send = async () => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    const value = serializeEditor(editor);
    if (!value.trim()) return;
    // Snapshot the token→local-path map now (before it's cleared) — a plain-object
    // copy, so a concurrent send clearing the live map can't strip paths mid-upload.
    await deliverPrompt(value, Object.fromEntries(imagePaths.current));
  };

  // Fire a message chosen from the history popover straight at the terminal,
  // without loading it into the composer first. Images resolve exactly like a
  // live send; a delivered message is recorded so it bumps to the top of history,
  // then focus moves to the terminal to watch the result.
  const sendFromHistory = async (text: string, images: Record<string, string>) => {
    if (!text.trim()) return;
    const payload = await buildTerminalPayload(text, images);
    if (!onSubmit(payload)) return;
    recordMessage({ text, projectName, terminalId: historyKey, terminalLabel: targetLabel, images });
    onFocusTerminal();
  };

  // Park the current prompt as a draft in message history without sending it,
  // then clear the composer the same way a send does (auto-close the tab, or
  // clear it in place) so the draft is filed away and the field is ready for the
  // next prompt. The draft is reopened later from the history popover.
  const saveCurrentDraft = async () => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    const value = serializeEditor(editor);
    if (!value.trim()) return;
    // Same re-entry guard send() uses: the field stays editable across the write,
    // so a save must not race a send (or a second save) of the same prompt.
    const draftId = activeId.current;
    if (sending.current.has(draftId)) return;
    const images = Object.fromEntries(imagePaths.current);
    sending.current.add(draftId);
    try {
      // Store the draft first; only clear the field once it's safely persisted so
      // a failed write never discards the prompt.
      await saveDraft({ text: value, projectName, terminalId: historyKey, terminalLabel: targetLabel, images });
      finishSend(draftId, editor);
      toast.success("Saved as draft");
    } catch {
      toast.error("Couldn't save draft");
    } finally {
      sending.current.delete(draftId);
    }
  };

  // Hand the current prompt to the duplicate flow. The current project is copy
  // #1: serialize the field and its live attachments (present tokens only), tag
  // it with the terminal's launch command / originating action, and let the host
  // open the seeded Duplicate dialog for the remaining `count - 1` copies. On
  // confirm the host fires `runHere`, which runs this same prompt in THIS
  // terminal — so the current project and every copy run it in parallel. Nothing
  // runs until confirm.
  const runInDuplicates = (count: number) => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    const text = serializeEditor(editor);
    if (!text.trim()) return;
    const present = presentImageTokens(editor);
    const images: ComposerImage[] = [];
    for (const [token, path] of imagePaths.current) {
      if (present.has(token)) images.push({ token, path });
    }
    const runHere = () => {
      if (transforming.current) return Promise.resolve();
      const map: Record<string, string> = {};
      for (const img of images) map[img.token] = img.path;
      return deliverPrompt(text, map);
    };
    onRunInDuplicates(
      { prompt: { text, images, pending: false }, count: count - 1, command: launchCmd, actionName },
      runHere,
    );
  };

  // Rebuild the field from a recalled/saved message: a chip for each token with
  // a mapped path, plain text otherwise (a literally-typed "[Image #N]" with no
  // path stays text rather than becoming a phantom, path-less chip). Leaves
  // histIdx to the caller; advances imgCounter past any recalled index so a
  // later paste can't collide.
  const applyHistoryEntry = (editor: HTMLDivElement, entry: ComposerHistoryEntry) => {
    editor.replaceChildren();
    imagePaths.current = new Map();
    let maxIdx = imgCounter.current;
    for (const seg of splitByImageTokens(entry.text)) {
      const path = seg.image === null ? undefined : entry.images[seg.image];
      if (seg.image !== null && path) {
        imagePaths.current.set(seg.image, path);
        editor.appendChild(createImageChip(seg.image));
        maxIdx = Math.max(maxIdx, seg.image);
      } else if (seg.text) {
        editor.appendChild(document.createTextNode(seg.text));
      }
    }
    imgCounter.current = maxIdx;
    syncState();
    placeCaretAtEnd(editor);
  };

  const undoSnapshot = (): UndoSnapshot | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    return {
      text: serializeEditor(editor),
      images: Object.fromEntries(imagePaths.current),
      caret: caretOffsetInSerialized(editor),
    };
  };

  const sameUndoState = (a: UndoSnapshot, b: UndoSnapshot): boolean => {
    if (a.text !== b.text) return false;
    const keys = Object.keys(a.images);
    return keys.length === Object.keys(b.images).length && keys.every((k) => a.images[k] === b.images[k]);
  };

  const resetUndo = () => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    undoStack.current = [];
    redoStack.current = [];
    undoBase.current = undoSnapshot();
  };

  const commitUndo = () => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    const live = undoSnapshot();
    if (!live) return;
    const base = undoBase.current;
    if (base) {
      if (sameUndoState(live, base)) return;
      undoStack.current.push(base);
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    }
    undoBase.current = live;
    redoStack.current = [];
  };

  const scheduleCommit = () => {
    if (commitTimer.current !== null) clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      commitUndo();
    }, UNDO_COALESCE_MS);
  };

  // Closing a step at each word boundary (a typed space or line break) is what
  // makes ⌘Z walk back word by word rather than clearing a whole burst at once.
  const noteEditForUndo = (input: InputEvent) => {
    if (input.isComposing) return; // a settled IME word is captured on the next edit / undo flush
    const type = input.inputType || "";
    const wordBoundary =
      type === "insertLineBreak" ||
      type === "insertParagraph" ||
      (type === "insertText" && input.data !== null && /\s/.test(input.data));
    if (wordBoundary) commitUndo();
    else scheduleCommit();
  };

  const applyUndoSnapshot = (snap: UndoSnapshot) => {
    const editor = editorRef.current;
    if (!editor) return;
    applyHistoryEntry(editor, { text: snap.text, images: snap.images });
    if (snap.caret !== null) placeCaretAtSerializedOffset(editor, snap.caret);
    highlightCommand(editor, isSlashCommand, memorySessionIds);
    setSlashOpen(false);
    setMentionOpen(false);
    setHint(null);
    histIdx.current = -1;
  };

  const undo = (): boolean => {
    commitUndo(); // finalize any pending burst so it stays redoable
    if (undoStack.current.length === 0) return false;
    if (undoBase.current) redoStack.current.push(undoBase.current);
    const prev = undoStack.current.pop()!;
    undoBase.current = prev;
    applyUndoSnapshot(prev);
    return true;
  };

  const redo = (): boolean => {
    commitUndo(); // a pending edit branches history: keep the typed text, abandon redo
    if (redoStack.current.length === 0) return false;
    if (undoBase.current) undoStack.current.push(undoBase.current);
    const next = redoStack.current.pop()!;
    undoBase.current = next;
    applyUndoSnapshot(next);
    return true;
  };

  // Latest undo/redo for the beforeinput listener below, which subscribes once.
  const historyRef = useRef({ undo, redo });
  historyRef.current = { undo, redo };

  // ⌘Z / ⌘⇧Z reach the field as `historyUndo` / `historyRedo` beforeinput events,
  // not keydown — an enabled Edit-menu key-equivalent is consumed before keydown
  // fires (the same reason the menu's cut/copy/paste arrive as native editing
  // events). Drive our own stacks and cancel WebKit's native undo, which never
  // saw the programmatic mutations and would corrupt the field. The keydown
  // branch covers the case where the native stack is empty, so the menu item is
  // disabled and the key falls through to the webview.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === "historyUndo") {
        e.preventDefault();
        historyRef.current.undo();
      } else if (e.inputType === "historyRedo") {
        e.preventDefault();
        historyRef.current.redo();
      }
    };
    editor.addEventListener("beforeinput", onBeforeInput);
    return () => editor.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  // Reset on tab switch (and the mount that seeds the first tab). resetUndo is
  // intentionally not a dep — it changes every render and would wipe history.
  useEffect(() => {
    resetUndo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  useEffect(
    () => () => {
      if (commitTimer.current !== null) clearTimeout(commitTimer.current);
    },
    [],
  );

  // Arrow Up/Down through the sent-message ring. The cursor is advanced before
  // the field is rewritten so applyHistoryEntry's syncState parks the new
  // position (and stash) with the draft it belongs to. The rewrite is bracketed
  // in two undo steps (like applyRewrite) so ⌘Z restores whatever the recall
  // replaced — an accidental ArrowUp must not lose the typed draft.
  const recall = (delta: 1 | -1): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const step = stepRecall({ index: histIdx.current, stash: histStash.current }, delta, history.current, {
      text: serializeEditor(editor),
      images: Object.fromEntries(imagePaths.current),
    });
    if (!step) return false;
    commitUndo();
    histIdx.current = step.index;
    histStash.current = step.stash;
    applyHistoryEntry(editor, step.entry);
    highlightCommand(editor, isSlashCommand, memorySessionIds);
    commitUndo();
    return true;
  };

  // Load a message chosen from the history popover, replacing the current draft.
  // Bracketed in undo steps so ⌘Z brings the replaced draft back.
  const loadFromHistory = (text: string, images: Record<string, string>) => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    commitUndo();
    applyHistoryEntry(editor, { text, images });
    histIdx.current = -1;
    commitUndo();
    editor.focus();
  };

  // Re-evaluate the slash menu after every edit. It opens whenever the target
  // terminal runs a known CLI and the caret sits in a "/<frag>" run — at the
  // start of the prompt or anywhere later in it — and closes the moment that run
  // ends (an argument, a space) or matches no command.
  const updateSlashMenu = () => {
    const editor = editorRef.current;
    if (!editor || transforming.current || !slashCli) {
      setSlashOpen(false);
      return;
    }
    const line = lineBeforeCaret(editor);
    const match = line !== null ? SLASH_TRIGGER.exec(line) : null;
    if (!match) {
      setSlashOpen(false);
      return;
    }
    const items = filterSlash(match[1]);
    if (items.length === 0) {
      setSlashOpen(false);
      return;
    }
    // Anchor to the caret; a collapsed caret at line start can report a zero-size
    // rect in WebKit, so fall back to the editor box then.
    let rect = editor.getBoundingClientRect();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const caret = sel.getRangeAt(0).getBoundingClientRect();
      if (caret.height > 0) rect = caret;
    }
    setSlashItems(items);
    setSlashIndex(0);
    setSlashRect(rect);
    setSlashOpen(true);
  };

  // Re-evaluate the "@" mention menu after every edit. It opens whenever the caret
  // sits in an "@<frag>" run (after whitespace, no spaces) in any terminal's
  // composer, and closes the moment that run ends or matches nothing.
  const updateMentionMenu = () => {
    const editor = editorRef.current;
    if (!editor || transforming.current) {
      setMentionOpen(false);
      return;
    }
    const line = lineBeforeCaret(editor);
    // A "/" run at the caret belongs to the slash menu. The two triggers only
    // overlap when a chip sits between an unfinished "@" run and the "/" (both
    // accept a chip as a boundary); yielding here keeps at most one menu open.
    if (line !== null && slashCli && SLASH_TRIGGER.test(line)) {
      setMentionOpen(false);
      return;
    }
    const argMatch = line !== null ? MEMORY_ARG_TRIGGER.exec(line) : null;
    const match = !argMatch && line !== null ? MENTION_TRIGGER.exec(line) : null;
    if (!argMatch && !match) {
      setMentionOpen(false);
      return;
    }
    const items = argMatch
      ? rankMentions(memorySessions, argMatch[1])
      : filterMentions(match![1]);
    if (items.length === 0) {
      setMentionOpen(false);
      return;
    }
    setMentionMode(argMatch ? "cmdArg" : "at");
    // Anchor to the caret, falling back to the editor box on a zero-size rect.
    let rect = editor.getBoundingClientRect();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const caret = sel.getRangeAt(0).getBoundingClientRect();
      if (caret.height > 0) rect = caret;
    }
    setMentionItems(items);
    setMentionIndex(0);
    setMentionRect(rect);
    setMentionOpen(true);
  };

  // Show the active command's argument-hint as ghost text once the line is a
  // completed "/command " with the caret at the very end (no args typed yet),
  // anchored just past the caret like the CLIs' own inline hint.
  const updateHint = () => {
    const editor = editorRef.current;
    const box = containerRef.current;
    if (!editor || !box || !slashCli) {
      setHint(null);
      return;
    }
    const line = lineBeforeCaret(editor);
    const match = line !== null ? HINT_TRIGGER.exec(line) : null;
    const text = match ? argumentHintFor(match[1]) : "";
    const sel = window.getSelection();
    if (!match || !text || !caretEdges(editor).atEnd || !sel || sel.rangeCount === 0) {
      setHint(null);
      return;
    }
    const caret = sel.getRangeAt(0).getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    setHint({
      text,
      left: caret.left - rect.left,
      top: caret.top - rect.top,
      height: caret.height || inputFontSize * 1.5,
    });
  };

  // Swap the typed "/<frag>" for the chosen "/<command> " and keep editing so the
  // user can add arguments before sending.
  const insertSlashCommand = (cmd: SlashCommand) => {
    const editor = editorRef.current;
    setSlashOpen(false);
    if (!editor) return;
    if (replaceSlashFragment(editor, cmd.name)) {
      histIdx.current = -1;
      normalizeComposer(editor);
      syncState();
      highlightCommand(editor, isSlashCommand, memorySessionIds);
      editor.focus();
      updateHint();
      updateMentionMenu();
    }
  };

  // Swap the typed "@<frag>" for the chosen "@<insert> " and keep editing so the
  // user can continue the prompt right after the reference. A service-log is
  // resolved by lpm (the agent can't read the in-memory pane buffer) — capture
  // and inject its output inline instead of a literal token.
  const insertMention = (item: MentionItem) => {
    const editor = editorRef.current;
    if (!editor) {
      setMentionOpen(false);
      return;
    }
    // The Memory group row drills into the session list in place — the menu
    // stays open and anchored; picking a session (or typing) leaves the mode.
    if (item.kind === "memory-group") {
      setMentionMode("memoryPick");
      setMentionItems(memoryMenuItems);
      setMentionIndex(0);
      return;
    }
    setMentionOpen(false);
    if (mentionMode === "cmdArg") {
      const line = lineBeforeCaret(editor);
      const m = line !== null ? MEMORY_ARG_TRIGGER.exec(line) : null;
      if (m && replaceArgFragment(editor, m[1], item.insert)) {
        afterMentionEdit(editor);
        editor.focus();
      }
      return;
    }
    if (item.kind === "memory" || item.kind === "memory-save") {
      if (replaceMentionFragmentWith(editor, memoryInvocation(item.insert))) {
        afterMemoryInsert(editor);
      }
      return;
    }
    if (item.kind === "service-log") {
      void insertServiceLog(editor, item);
      return;
    }
    if (item.kind === "terminal-log") {
      const body = trimLogBody(captureInteractivePaneLog(item.terminalId ?? terminalId, MENTION_LOG_LINES));
      injectLog(editor, item.label, "terminal output", body);
      return;
    }
    if (replaceMentionFragment(editor, item.insert)) {
      afterMentionEdit(editor);
      editor.focus();
    }
  };

  // Shared tail after a mention rewrites the field: reset history navigation,
  // fold stray nodes, and resync the send/preview state.
  const afterMentionEdit = (editor: HTMLDivElement) => {
    histIdx.current = -1;
    normalizeComposer(editor);
    syncState();
  };

  // A memory session becomes the terminal CLI's own invocation: "/lpm-memory
  // <id>" runs the skill in Claude Code; every other agent gets the skill-mention
  // form "$lpm-memory <id>" (Codex's syntax; inert but self-describing text
  // elsewhere). The bare command — no session — means "remember this
  // conversation", so it keeps no trailing argument space.
  const memoryInvocation = (sessionId: string) => {
    const cmd = slashCli === "claude" ? "/lpm-memory" : "$lpm-memory";
    return sessionId ? `${cmd} ${sessionId} ` : cmd;
  };

  // Shared tail after a memory invocation lands in the field. The insertion's own
  // input event has already re-opened the slash menu and hint on the bare command
  // by the time we get here; the pick is already decided, so close them and park
  // the command in the editor for the user to review and send.
  const afterMemoryInsert = (editor: HTMLDivElement) => {
    afterMentionEdit(editor);
    highlightCommand(editor, isSlashCommand, memorySessionIds);
    setSlashOpen(false);
    setMentionOpen(false);
    setHint(null);
    editor.focus();
  };

  // Footer memory button: the same invocation as an "@" pick, dropped at the
  // caret since no typed fragment precedes it. The caret is parked first (the
  // button can be clicked before the field was ever focused) so the padding
  // space — which keeps the command off the back of whatever word precedes it —
  // is decided from where the text will actually land.
  const insertMemorySession = (item: MentionItem) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!caretInside(editor)) placeCaretAtEnd(editor);
    const line = lineBeforeCaret(editor);
    const pad = line && !/\s$/.test(line) ? " " : "";
    if (insertTextAtCaret(editor, `${pad}${memoryInvocation(item.insert)}`)) {
      afterMemoryInsert(editor);
    }
  };

  const deleteMemorySession = async (item: MentionItem) => {
    try {
      await DeleteMemorySession(projectName, item.insert);
      reloadMemorySessions();
    } catch (err) {
      toast.error(`Delete memory: ${String(err)}`);
    }
  };

  // The dialog took focus off the editor to be typed into, so hand it back —
  // the user was mid-draft when they reached for the memory list.
  const renameMemorySession = async (item: MentionItem, name: string) => {
    try {
      await RenameMemorySession(projectName, item.insert, name);
      reloadMemorySessions();
    } catch (err) {
      toast.error(`Rename memory: ${String(err)}`);
    }
    editorRef.current?.focus();
  };

  // Capture the service's current pane output (an async grab) and inject it.
  const insertServiceLog = async (editor: HTMLDivElement, item: MentionItem) => {
    let body = "";
    try {
      const out = await GetServiceLogs(projectName, item.paneIndex ?? 0, MENTION_LOG_LINES);
      body = typeof out === "string" ? trimLogBody(out) : "";
    } catch {
      body = "";
    }
    if (!editor.isConnected) return;
    injectLog(editor, item.label, `${item.label} service logs`, body);
  };

  // Drop captured output into the draft where the "@<frag>" was, as a labeled
  // fenced block — point-in-time, whatever the source shows now, not a live tail.
  // On an empty capture the typed "@<frag>" is removed and a toast explains why,
  // so nothing dangles. Shared by the service- and terminal-log mentions.
  const injectLog = (editor: HTMLDivElement, label: string, heading: string, body: string) => {
    if (!body) toast.error(`No logs for ${label}`);
    const text = body ? formatLogBlock(heading, body) : "";
    if (replaceMentionFragmentWith(editor, text)) afterMentionEdit(editor);
    editor.focus();
  };

  // Rebuild the field from a rewrite, bracketing it in two undo steps so ⌘Z
  // reverts to the pre-action text. Reused by the single-result path and the
  // variant picker.
  const applyRewrite = (editor: HTMLDivElement, text: string, images: Record<string, string>) => {
    commitUndo(); // finalize the pre-action text as its own undo step…
    applyHistoryEntry(editor, { text, images });
    histIdx.current = -1;
    commitUndo(); // …and the rewrite as the next, so ⌘Z reverts it
  };

  // Release the transform lock and re-seat focus/caret once the field flips back
  // to editable next render.
  const endTransform = () => {
    transforming.current = false;
    setTransformingId(null);
    requestAnimationFrame(() => {
      const ed = editorRef.current;
      if (ed) {
        ed.focus();
        placeCaretAtEnd(ed);
      }
    });
  };

  // Apply a composer action: send the current text through the user's AI CLI
  // with the action's instruction, then rebuild the field from the result —
  // reusing the history-entry path so any preserved image tokens become chips.
  // A count above 1 asks for several rewrites and opens the variant picker
  // instead of applying one straight away.
  const runAction = async (action: ComposerAction, count = 1) => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    const value = serializeEditor(editor);
    if (!value.trim()) return;
    // Snapshot text, the image map, and the originating tab before the await.
    // The field is locked and tab switching is blocked while a transform runs
    // (see `transforming`), so nothing can race the result back in — pinning the
    // snapshot just keeps the rebuilt field faithful to exactly what was sent.
    const images = Object.fromEntries(imagePaths.current);
    const startedId = activeId.current;
    transforming.current = true;
    setTransformingId(action.id);
    // The picker keeps the transform locked until a variant is committed, so the
    // finally must not release it — chooseVariant/closeVariants do.
    let openedPicker = false;
    try {
      // Read the live AI selection at run time — the picker in the manage modal
      // (or any other AI flow) may have changed it since this composer mounted.
      const params = resolveTransformParams(ai);
      if (count <= 1) {
        const out = await gen.run((genId) =>
          TransformText(
            projectName,
            cwd,
            params.cli,
            params.model,
            params.effort,
            params.fast,
            action.instruction,
            value,
            genId,
          ),
        );
        const text = typeof out === "string" ? out.trim() : "";
        if (!text) {
          toast.error("AI returned an empty response");
          return;
        }
        if (activeId.current !== startedId) return;
        applyRewrite(editor, text, images);
      } else {
        const list = await gen.runAll(count, (genIds) =>
          generateVariants(projectName, cwd, params, action.instruction, value, count, genIds),
        );
        if (list.length === 0) {
          toast.error("AI returned an empty response");
          return;
        }
        if (activeId.current !== startedId) return;
        openedPicker = true;
        setVariants({ label: action.label, list, images, startedId });
      }
    } catch (err) {
      if (!isCanceledError(err)) toast.error(`Action failed: ${err}`);
    } finally {
      if (!openedPicker) endTransform();
    }
  };

  const chooseVariant = (text: string) => {
    const session = variants;
    setVariants(null);
    const editor = editorRef.current;
    // The lock pins the tab while the picker is open, so this normally holds; the
    // guard just refuses to write a rewrite into the wrong tab if it somehow did.
    if (editor && session && activeId.current === session.startedId) {
      applyRewrite(editor, text, session.images);
    }
    endTransform();
  };

  const closeVariants = () => {
    setVariants(null);
    endTransform();
  };

  // Bracketed in undo steps — chip removal fires no input event, so without an
  // explicit step ⌘Z couldn't bring the deleted image back.
  const deleteImageChip = (chip: HTMLElement) => {
    commitUndo();
    imagePaths.current.delete(Number(chip.dataset.img));
    removeChip(chip);
    syncState();
    commitUndo();
  };

  // Cut/Copy of a selection holding attachment chips writes the serialized text
  // (chips as "[Image #N]" tokens, not their visible labels) plus an HTML flavor
  // referencing the token→path map — so pasting rebuilds the images in this or
  // any other composer, and external apps get the token text. A chip-free
  // selection falls through to native copy/cut. Cut deletes through execCommand
  // so the edit flows through onInput (undo, normalize, sync) like ordinary
  // editing — except a chip-only selection, which WebKit refuses to delete
  // natively (it collapses the selection instead; see selectedChip) and is
  // removed explicitly, keeping its path alive for a plain-text paste-back.
  const handleCopyCut = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    const payload = selectionClipboardPayload(editor, imagePaths.current);
    if (!payload) return;
    e.preventDefault();
    writeClipboardPayload(e.clipboardData, payload);
    if (!cut) return;
    const chip = selectedChip(editor);
    if (chip) {
      commitUndo();
      removeChip(chip);
      histIdx.current = -1;
      syncState(false);
      commitUndo();
    } else {
      document.execCommand("delete");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    // While the lightbox is open the editor keeps focus, so swallow its keys
    // (the field below must not type/send) and close the preview on Escape — the
    // editor's own stopPropagation would otherwise keep Escape from the modal.
    if (lightboxPath !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") setLightboxPath(null);
      return;
    }
    // The field is locked while an action transform runs; swallow keys so a
    // stray Enter/Arrow can't send or recall over the in-flight result.
    if (transforming.current) {
      e.preventDefault();
      return;
    }
    // While the slash menu is open it owns navigation/accept/dismiss, ahead of
    // the Enter-to-send, history-recall, and Escape handlers below. Other keys
    // fall through to normal editing and re-evaluate the menu via onInput.
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSlashIndex((i) => Math.min(slashItems.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSlashIndex((i) => Math.max(0, i - 1));
        return;
      }
      // While an IME candidate is composing, Enter/Tab commits it — let the event
      // fall through untouched (the send path gates itself the same way) instead
      // of accepting a menu row and discarding the composition.
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        const cmd = slashItems[slashIndex];
        if (cmd) insertSlashCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSlashOpen(false);
        return;
      }
    }
    // The mention menu owns the same keys while open (the slash and mention
    // triggers are mutually exclusive, so at most one is ever open).
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setMentionIndex((i) => Math.min(mentionItems.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      // See the slash menu above: don't hijack an IME-committing Enter/Tab.
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        const item = mentionItems[mentionIndex];
        if (item) insertMention(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMentionOpen(false);
        return;
      }
    }
    // Handles ⌘Z/⌘⇧Z only when it reaches keydown (native stack empty, so the
    // Edit-menu item is disabled); the enabled-menu case goes through the
    // beforeinput listener above. We always own ⌘Z — native undo corrupts this
    // field — so it never falls through.
    if (e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    // ⌘⇧T / ⌘⇧W act on the composer's own tabs while the input is focused. addTab
    // already creates and jumps to the new tab; closeTab no-ops on the last tab
    // (so ⌘⇧W there does nothing) and otherwise adopts the left neighbour. The
    // plain (un-shifted) chords fall through to the app chrome — see the guard below.
    if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        e.stopPropagation();
        addTab();
        return;
      }
      if (k === "w") {
        e.preventDefault();
        e.stopPropagation();
        closeTab(activeId.current);
        return;
      }
    }
    // Ctrl chords are this field's own macOS text bindings (⌃A start of line,
    // ⌃E end, ⌃B back a char, ⌃K kill) — they must not reach the global
    // shortcuts, which treat Ctrl as Cmd and would preventDefault them. ⌘ chords
    // belong to the app: one that must not fire mid-prompt declares
    // `whileTyping: false` at its own registration instead of being listed here.
    if (e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
    }
    // Any caret move can make WebKit inject stray chars around a chip — the
    // explicit stepping below covers the common case, this cleans the rest
    // (word/line jumps, vertical moves, boundaries) before the next paint.
    if (e.key.startsWith("Arrow")) scheduleNormalize();
    // ⌘↵ saves the prompt as a draft instead of sending it (mirrors the send
    // button's split menu). Checked before plain ↵ so the modifier wins.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      void saveCurrentDraft();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      void send();
      return;
    }
    if (e.key === "Enter" && e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      document.execCommand("insertText", false, "\n");
      histIdx.current = -1;
      return;
    }
    if (e.key === "Escape") {
      // Escape returns focus to the terminal but keeps the input open — it must
      // not dismiss the composer.
      e.preventDefault();
      e.stopPropagation();
      onFocusTerminal();
      return;
    }
    // A single Backspace/Delete next to a chip removes the whole image at once —
    // the caret can never sit inside a chip, so partial deletion is impossible.
    // A whole-chip selection (left behind by a body click) is removed too, since
    // WebKit only collapses such a selection on the first press.
    if (e.key === "Backspace" || e.key === "Delete") {
      const chip =
        selectedChip(editor) ?? (e.key === "Backspace" ? chipBeforeCaret(editor) : chipAfterCaret(editor));
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        deleteImageChip(chip);
        return;
      }
    }
    // Step the caret across an atomic chip ourselves; WebKit's native navigation
    // around contenteditable=false inline elements can otherwise leave stray
    // placeholder characters behind.
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && !e.metaKey && !e.altKey) {
      const chip = e.key === "ArrowLeft" ? chipBeforeCaret(editor) : chipAfterCaret(editor);
      if (chip) {
        e.preventDefault();
        const range = document.createRange();
        if (e.key === "ArrowLeft") range.setStartBefore(chip);
        else range.setStartAfter(chip);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const edges = caretEdges(editor);
      if (e.key === "ArrowUp" && edges.collapsed && edges.atStart) {
        if (recall(1)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "ArrowDown" && edges.collapsed && edges.atEnd && histIdx.current !== -1) {
        if (recall(-1)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Clicking the chip's remove button (the icon, shown as "×" on hover) drops
    // the image outright — the easy way to get rid of it.
    const removeBtn = target.closest<HTMLElement>("[data-img-remove]");
    if (removeBtn) {
      e.preventDefault();
      const chip = removeBtn.closest<HTMLElement>("[data-img]");
      if (chip) {
        deleteImageChip(chip);
        dismissPreview();
        editorRef.current?.focus();
      }
      return;
    }
    // Clicking elsewhere on an image chip opens it full-window; a non-image file
    // chip has no preview, so its body click does nothing (remove via the "×").
    // A chip with no mapped path (shouldn't happen) falls back to selecting it as
    // a unit so it can still be deleted with Backspace.
    const chip = target.closest<HTMLElement>("[data-img]");
    if (chip) {
      e.preventDefault();
      const path = imagePaths.current.get(Number(chip.dataset.img));
      if (path && isImagePath(path)) {
        dismissPreview();
        setLightboxPath(path);
      } else if (!path) {
        selectChip(chip);
      }
      return;
    }
    // A plain click landing after a trailing chip mispaints the caret at the
    // field start; re-anchor it once the click's selection settles.
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor && restoreTrailingChipCaret(editor)) syncState();
    });
  };

  const handleHover = (e: MouseEvent<HTMLDivElement>) => {
    // A held button means a drag/selection gesture, not a hover.
    if (e.buttons !== 0) return;
    const target = e.target as HTMLElement;
    const chip =
      target.closest<HTMLElement>("[data-img]") ??
      target.closest<HTMLElement>("[data-memchip]");
    if (chip === hoverChip.current) return;
    hoverChip.current = chip;
    if (!chip) {
      setPreview(null);
      return;
    }
    if (chip.dataset.memchip !== undefined) {
      setPreview({ kind: "memory", id: chip.dataset.memchip, rect: chip.getBoundingClientRect() });
      return;
    }
    const path = imagePaths.current.get(Number(chip.dataset.img));
    setPreview(
      path && isImagePath(path)
        ? { kind: "image", path, rect: chip.getBoundingClientRect() }
        : null,
    );
  };

  // The placeholder is absolutely positioned over the editor's first line, so
  // both must share identical font metrics or the placeholder drifts.
  const textStyle = { fontSize: inputFontSize, lineHeight: 1.5, fontFamily: TERMINAL_FONT_FAMILY };

  const busy = transformingId !== null;
  const showActions = ai.anyAvailable;

  return (
    <div className="composer-terminal-surface border-t border-[var(--composer-border)] bg-[var(--terminal-bg)] px-3 pb-1 pt-2">
      {tabView.length > 1 && (
        <ComposerTabStrip
          tabs={tabView}
          activeId={activeTabId}
          onSelect={switchTab}
          onClose={closeTab}
          onAdd={addTab}
          onReorder={reorderTabs}
        />
      )}
      <div
        className={`rounded-xl p-px ${
          busy
            ? "[background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
            : ""
        }`}
      >
      <div
        ref={containerRef}
        data-composer-box
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.contains(next)) setDragOver(false);
        }}
        onDrop={handleDrop}
        className={`relative rounded-xl bg-[var(--composer-surface)] transition-colors ${
          busy
            ? "border border-transparent"
            : "border border-[var(--composer-border)] focus-within:border-[var(--composer-border-focus)]"
        }`}
      >
        {dragOver && <TerminalDropOverlay compact label="Drop files to add" />}
        <div
          ref={editorRef}
          contentEditable={!busy}
          suppressContentEditableWarning
          data-terminal-composer
          data-text-scope=""
          role="textbox"
          aria-multiline="true"
          aria-label={`Send to ${targetLabel}`}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onInput={(e) => {
            histIdx.current = -1;
            const editor = editorRef.current;
            if (editor) normalizeComposer(editor);
            noteEditForUndo(e.nativeEvent as InputEvent);
            syncState();
            if (editor) highlightCommand(editor, isSlashCommand, memorySessionIds);
            updateSlashMenu();
            updateMentionMenu();
            updateHint();
          }}
          onFocus={() => {
            refreshMentions();
          }}
          onBlur={() => {
            setSlashOpen(false);
            setMentionOpen(false);
            setHint(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={(e) => handleCopyCut(e, false)}
          onCut={(e) => handleCopyCut(e, true)}
          onClick={handleClick}
          onMouseOver={handleHover}
          onMouseLeave={dismissPreview}
          onScroll={dismissPreview}
          style={textStyle}
          className="block max-h-[200px] min-h-[24px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3.5 py-1.5 text-[var(--composer-fg)] outline-none [overflow-wrap:anywhere]"
        />
        {blank && (
          <div
            style={textStyle}
            className="pointer-events-none absolute left-3.5 right-3.5 top-1.5 truncate text-[var(--composer-fg-muted)]"
          >
            {composerPlaceholder(targetLabel)}
          </div>
        )}
        {hint && (
          <div
            aria-hidden
            style={{ fontSize: inputFontSize, fontFamily: TERMINAL_FONT_FAMILY, left: hint.left, top: hint.top, height: hint.height, lineHeight: `${hint.height}px` }}
            className="pointer-events-none absolute whitespace-pre text-[var(--composer-fg-muted)]"
          >
            {hint.text}
          </div>
        )}
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="flex items-center gap-1">
            <ComposerMicButton />
            {showActions && (
              <ComposerActionsButton
                align="left"
                enabledActions={enabledActions}
                busy={busy}
                onStop={gen.generating ? gen.cancel : undefined}
                canRun={!disabled}
                cliLabel={ai.cliLabel}
                onRun={runAction}
                onManage={() => setActionsModalOpen(true)}
              />
            )}
            <Tooltip content="New prompt  ·  ⌘⇧T" delay={COMPOSER_TOOLTIP_DELAY_MS}>
              <button
                type="button"
                onClick={addTab}
                aria-label="New input"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--composer-fg-muted)] transition-colors hover:bg-[var(--composer-hover-bg)] hover:text-[var(--composer-fg)]"
              >
                <PlusIcon />
              </button>
            </Tooltip>
            <TerminalHistoryButton
              terminalId={historyKey}
              projectName={projectName}
              terminalLabel={targetLabel}
              onPick={loadFromHistory}
              onSend={sendFromHistory}
              initialCollection={COLLECTION_DRAFTS}
              icon={<SquarePenIcon />}
              tooltip="Drafts"
              ariaLabel="Drafts"
            />
            <TerminalHistoryButton
              terminalId={historyKey}
              projectName={projectName}
              terminalLabel={targetLabel}
              onPick={loadFromHistory}
              onSend={sendFromHistory}
            />
            {memoryAvailable && (
              <ComposerMemoryButton
                sessions={memorySessions}
                infoById={memorySessionById}
                attached={memory}
                onOpen={reloadMemorySessions}
                onPick={insertMemorySession}
                onView={(item) => onOpenMemorySession(item.insert)}
                onRename={(item, name) => void renameMemorySession(item, name)}
                onDelete={(item) => void deleteMemorySession(item)}
                onDetach={onDetachMemory}
              />
            )}
            {agentStatus && (
              <AgentStatusChip
                status={agentStatus}
                className="pl-1.5 pr-0.5"
                fontSize={inputFontSize}
                compact
              />
            )}
          </div>
          <SendSplitButton
            disabled={disabled}
            busy={busy}
            onSend={() => void send()}
            onSaveDraft={() => void saveCurrentDraft()}
            onRunInDuplicates={runInDuplicates}
          />
        </div>
      </div>
      </div>
      {preview?.kind === "image" && (
        <ImagePreviewPopover path={preview.path} anchor={preview.rect} slug={peerSlug} />
      )}
      {preview?.kind === "memory" && (
        <MemoryPreviewPopover session={memorySessionById.get(preview.id)} anchor={preview.rect} />
      )}
      {lightboxPath && (
        <ImageLightbox path={lightboxPath} onClose={() => setLightboxPath(null)} slug={peerSlug} />
      )}
      {slashOpen && (
        <SlashCommandMenu
          commands={slashItems}
          selectedIndex={slashIndex}
          anchorRect={slashRect}
          onSelect={insertSlashCommand}
          onHoverIndex={setSlashIndex}
        />
      )}
      {mentionOpen && (
        <MentionMenu
          items={mentionItems}
          selectedIndex={mentionIndex}
          anchorRect={mentionRect}
          onSelect={insertMention}
          onHoverIndex={setMentionIndex}
          submenuFor={(item) => (item.kind === "memory-group" ? memoryMenuItems : null)}
          footer={mentionMode === "cmdArg" ? "Type a new name or leave blank to create a new memory" : undefined}
        />
      )}
      <ComposerActionsModal open={actionsModalOpen} onClose={() => setActionsModalOpen(false)} />
      <ComposerVariantsModal
        open={variants !== null}
        actionLabel={variants?.label ?? ""}
        variants={variants?.list ?? []}
        onChoose={chooseVariant}
        onClose={closeVariants}
      />
    </div>
  );
}

// Raw byte length a base64 string decodes to, for the peer upload size gate —
// avoids decoding the whole payload just to measure it.
function base64ByteLength(b64: string): number {
  if (b64.length === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      resolve(url.split(",")[1] ?? null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// Tidy a raw pane capture for the prompt: drop trailing spaces each line
// keeps, then strip blank lines that bookend the grab (a full-height pane pads
// the bottom), leaving the meaningful run intact.
function trimLogBody(raw: string): string {
  return raw.replace(/[ \t]+$/gm, "").replace(/^\n+/, "").replace(/\n+$/, "");
}

// Render captured output under a heading as a labeled, fenced block. A trailing
// newline leaves the caret on a fresh line so the user keeps typing below it.
function formatLogBlock(heading: string, body: string): string {
  return `${heading}:\n\`\`\`\n${body}\n\`\`\`\n`;
}
