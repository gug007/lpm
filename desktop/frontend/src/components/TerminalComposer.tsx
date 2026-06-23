import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { toast } from "sonner";
import {
  ReadClipboardFiles,
  SaveClipboardImage,
  TransformText,
  UploadAndQuoteForTerminal,
} from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { useAIPicker } from "../hooks/useAIPicker";
import { aiEffectiveFast, type AICLI } from "../types";
import { getSettings } from "../store/settings";
import {
  useEnabledComposerActions,
  type ComposerAction,
} from "../store/composerActions";
import { ComposerActionsButton } from "./ComposerActionsButton";
import { ComposerActionsModal } from "./ComposerActionsModal";
import {
  createInputTab,
  loadComposerDraft,
  saveComposerDraft,
  type ComposerHistoryEntry,
  type ComposerInputTab,
} from "../store/composerDrafts";
import { recordMessage } from "../store/messageHistory";
import { ComposerTabStrip, type ComposerTabView } from "./ComposerTabStrip";
import { PlusIcon, SendIcon } from "./icons";
import { ImagePreviewPopover } from "./ImagePreviewPopover";
import { ImageLightbox } from "./ImageLightbox";
import { loadImageDataUrl } from "./imageDataUrl";
import { TerminalHistoryButton } from "./TerminalHistoryButton";
import { TerminalDropOverlay } from "./terminal/TerminalDropOverlay";
import {
  caretEdges,
  chipAfterCaret,
  chipBeforeCaret,
  createImageChip,
  highlightCommand,
  insertItemsAtCaret,
  isEditorEmpty,
  lineBeforeCaret,
  normalizeComposer,
  placeCaretAtEnd,
  placeCaretFromPoint,
  presentImageTokens,
  removeChip,
  replaceMentionFragment,
  replaceSlashFragment,
  restoreTrailingChipCaret,
  selectChip,
  selectedChip,
  serializeEditor,
  setChipThumbnail,
  setEditorContent,
  splitByImageTokens,
} from "./composerEditor";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { detectAICLI, type SlashCommand } from "../slashCommands";
import { MentionMenu } from "./MentionMenu";
import { useMentions } from "../hooks/useMentions";
import { MENTION_TRIGGER, type MentionItem } from "../mentions";

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
  // Working directory the AI CLI runs in when applying a composer action.
  cwd: string;
  // The target terminal's launch command, if any. Its leading binary tells us
  // which AI CLI is running there (e.g. "claude …" / "codex …"), which scopes the
  // "/" slash-command autocomplete. Absent / unrecognized keeps the menu off.
  launchCmd?: string;
  // Terminal font size; the composer text scales to match it.
  fontSize: number;
  // Returns false when the input could not be delivered (e.g. a dead session),
  // so the draft is kept rather than cleared. An array carries ordered segments
  // (text runs and image paths) to be delivered as separate pastes.
  onSubmit: (input: string | string[]) => boolean;
  onFocusTerminal: () => void;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;

// The caret's line must be only "/<frag>" (after optional indentation) to open
// the slash menu; ":" is allowed for namespaced names like "prompts:draftpr".
const SLASH_TRIGGER = /^\s*\/([a-z0-9:_-]*)$/i;

// A completed command followed by exactly one space (and nothing after) — shows
// the command's argument-hint as ghost text, the way the CLIs do. A second space
// or any typed argument ends this state and hides the hint.
const HINT_TRIGGER = /^\s*\/([a-z0-9:_-]+) $/i;

// A short, single-line label for a prompt tab: its text with image tokens
// dropped, collapsed whitespace. Empty when the draft holds nothing visible.
function previewLabel(text: string): string {
  const segments = splitByImageTokens(text);
  const textOnly = segments
    .filter((s) => s.image === null)
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (textOnly) return textOnly;
  return segments.some((s) => s.image !== null) ? "Image" : "";
}

function sameTabView(a: ComposerTabView[], b: ComposerTabView[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t.id === b[i].id && t.label === b[i].label);
}

export function TerminalComposer({ terminalId, historyKey, projectName, shown, focused, targetLabel, cwd, launchCmd, fontSize, onSubmit, onFocusTerminal }: TerminalComposerProps) {
  // `blank` drives the placeholder (no content at all); `disabled` drives the
  // send button (nothing but whitespace).
  const [blank, setBlank] = useState(true);
  const [disabled, setDisabled] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ path: string; rect: DOMRect } | null>(null);
  // Local path of the image shown full-window in the lightbox, or null when closed.
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);
  // The composer action currently being applied (drives the busy UI), or null.
  const [transformingId, setTransformingId] = useState<string | null>(null);
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
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
  // Mentions share the slash menu's gating — only an agent terminal (slashCli)
  // that's focused loads them, so a plain shell never pays for a tree walk.
  const { filter: filterMentions } = useMentions(cwd, focused && slashCli !== null);
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
  // [Image #N] index -> local file path, swapped back in when the draft is sent.
  const imagePaths = useRef<Map<number, string>>(new Map());
  const imgCounter = useRef(0);
  const normalizePending = useRef(false);
  // Prompt ids whose send is mid-flight (image upload). Guards send() against
  // re-entry so a second Enter on the same tab can't double-deliver it, while
  // still letting a different prepared prompt be sent in the meantime.
  const sending = useRef<Set<string>>(new Set());
  // Read by the show effect (keyed on `shown`) so it doesn't re-run on focus
  // changes — clicking a pane's terminal must not steal focus into its input.
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // Fill each image chip with its thumbnail (lazily, from the shared cache). A
  // chip is marked once loading starts (`thumb`) so repeated syncState calls are
  // cheap; a load that fails leaves the placeholder glyph and isn't retried.
  const hydrateThumbnails = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>("[data-img]").forEach((chip) => {
      if (chip.dataset.thumb) return;
      const path = imagePaths.current.get(Number(chip.dataset.img));
      if (!path) return;
      chip.dataset.thumb = "pending";
      loadImageDataUrl(path)
        .then((url) => {
          if (chip.isConnected) setChipThumbnail(chip, url);
        })
        .catch(() => {
          chip.dataset.thumb = "failed";
        });
    });
  }, []);

  // Push the current tab set into the reactive mirror. Labels are computed only
  // when the strip is visible (2+ tabs); a lone tab carries an empty label so its
  // per-keystroke text changes never produce a new view and never re-render.
  const refreshTabView = useCallback(() => {
    const list = tabs.current;
    const multi = list.length > 1;
    const next = list.map((t) => ({ id: t.id, label: multi ? previewLabel(t.text) : "" }));
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
    activeId.current = tab.id;
    setEditorContent(editor, tab.text);
    setBlank(isEditorEmpty(editor));
    setDisabled(serializeEditor(editor).trim() === "");
    setPreview(null);
    placeCaretAtEnd(editor);
    hydrateThumbnails();
  }, [hydrateThumbnails]);

  // Restore this terminal's saved draft on mount (the composer is remounted per
  // terminal), then focus it — so switching terminals brings back what you'd
  // typed and puts the cursor in the input. useLayoutEffect so the restored text
  // is painted in one frame (no empty-with-placeholder flash).
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const draft = loadComposerDraft(terminalId);
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
    setBlank(isEditorEmpty(editor));
    setDisabled(value.trim() === "");
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
    }
    saveComposerDraft(terminalId, {
      tabs: tabs.current,
      activeTabId: activeId.current,
      history: history.current,
    });
    refreshTabView();
    hydrateThumbnails();
  }, [terminalId, refreshTabView, hydrateThumbnails]);

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
    return createImageChip(n);
  }, []);

  const addImageBlob = useCallback(
    async (blob: Blob): Promise<HTMLSpanElement | null> => {
      const b64 = await blobToBase64(blob);
      if (!b64) return null;
      try {
        const path = await SaveClipboardImage(b64, blob.type || "image/png");
        return typeof path === "string" && path ? registerImagePath(path) : null;
      } catch {
        return null;
      }
    },
    [registerImagePath],
  );

  const insertItems = useCallback(
    (items: Array<HTMLElement | string>) => {
      const editor = editorRef.current;
      if (!editor || items.length === 0) return;
      insertItemsAtCaret(editor, items);
      histIdx.current = -1;
      syncState();
    },
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

  // Only image paths become chips; non-image paths are dropped (this is an
  // image-only field — inserting an absolute file path as text would leak it).
  const insertImagePaths = useCallback(
    (paths: string[]) => insertItems(paths.filter((p) => IMAGE_EXT_RE.test(p)).map(registerImagePath)),
    [insertItems, registerImagePath],
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
      insertImagePaths(paths);
      setDragOver(false);
      return true;
    });
  }, [insertImagePaths, pointInComposer, focusAtPoint]);

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
      // Copied image files (WebKit often omits the MIME) — resolve real paths.
      if (dt.types.includes("Files") || dt.files.length > 0) {
        e.preventDefault();
        void ReadClipboardFiles()
          .then((paths) => {
            if (Array.isArray(paths) && paths.length > 0) insertImagePaths(paths);
          })
          .catch(() => {});
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
        );
        return;
      }
      document.execCommand("insertText", false, text);
      histIdx.current = -1;
      syncState();
    },
    [addImageBlob, insertImagePaths, insertImageChips, insertItems, syncState],
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
        imagePaths.current.clear();
        setEditorContent(editor, "");
        setPreview(null);
      } else {
        const tab = tabs.current[idx];
        tab.text = "";
        tab.imagePaths = new Map();
        tab.imgCounter = 0;
        tab.histIdx = -1;
      }
    }
    syncState();
    editor.focus();
  };

  const send = async () => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    const value = serializeEditor(editor);
    if (!value.trim()) return;
    // The editor stays editable across the upload await, so pin which prompt is
    // being sent now; a concurrent tab switch must not redirect the retire below.
    const sentId = activeId.current;
    // Re-entry guard scoped to this prompt: block a second Enter on the same tab
    // mid-upload, while a different prepared prompt can still be sent.
    if (sending.current.has(sentId)) return;
    // Snapshot the token→local-path map now (before it's cleared) for both the
    // recall ring and the durable history — local paths, so a re-send re-uploads.
    const paths = new Map(imagePaths.current);
    const images = Object.fromEntries(paths);
    const segments = splitByImageTokens(value);
    // Only segments whose token resolves to a real path are images; a literal
    // "[Image #N]" the user typed rides along as plain text in one paste. Read
    // from the local snapshot so a concurrent send clearing the map can't strip
    // paths mid-upload.
    const hasImages = segments.some((s) => s.image !== null && paths.has(s.image));
    sending.current.add(sentId);
    try {
      let payload: string | string[];
      if (hasImages) {
        // Resolve each image to a deliverable path — uploaded (scp'd) for a remote
        // pane, passed through for a local one — keeping per-segment order. Each
        // path is its own bracketed paste so a path-attaching agent keeps order;
        // pad it so it stays a distinct token, and drop blank runs between chips.
        const parts = await Promise.all(
          segments.map(async (s) => {
            const path = s.image === null ? undefined : paths.get(s.image);
            if (path === undefined) return s.text;
            const uploaded = await UploadAndQuoteForTerminal(terminalId, [path]).catch(() => "");
            return ` ${uploaded || path} `;
          }),
        );
        payload = parts.filter((p) => p.trim().length > 0);
      } else {
        payload = value;
      }
      if (!onSubmit(payload)) return;
      history.current.unshift({ text: value, images });
      // The prepend shifts every existing entry up by one; nudge each recall
      // cursor (per-tab and the live one) so it stays anchored to its message.
      for (const t of tabs.current) if (t.histIdx >= 0) t.histIdx += 1;
      if (histIdx.current >= 0) histIdx.current += 1;
      recordMessage({
        text: value,
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

  const recall = (delta: 1 | -1): boolean => {
    const editor = editorRef.current;
    const hist = history.current;
    if (!editor || hist.length === 0) return false;
    const next = Math.min(hist.length - 1, Math.max(-1, histIdx.current + delta));
    if (next === histIdx.current) return false;
    if (next === -1) {
      imagePaths.current = new Map();
      setEditorContent(editor, "");
      syncState();
      placeCaretAtEnd(editor);
    } else {
      applyHistoryEntry(editor, hist[next]);
    }
    histIdx.current = next;
    return true;
  };

  // Load a message chosen from the history popover, replacing the current draft.
  const loadFromHistory = (text: string, images: Record<string, string>) => {
    const editor = editorRef.current;
    if (!editor || transforming.current) return;
    applyHistoryEntry(editor, { text, images });
    histIdx.current = -1;
    editor.focus();
  };

  // Re-evaluate the slash menu after every edit. It opens only when the target
  // terminal runs a known CLI and the caret's line is exactly "/<frag>" (no
  // spaces yet), so typing args or any other text closes it.
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

  // Re-evaluate the "@" mention menu after every edit. It opens only for an agent
  // terminal when the caret sits in an "@<frag>" run (after whitespace, no
  // spaces), and closes the moment that run ends or matches nothing.
  const updateMentionMenu = () => {
    const editor = editorRef.current;
    if (!editor || transforming.current || !slashCli) {
      setMentionOpen(false);
      return;
    }
    const line = lineBeforeCaret(editor);
    const match = line !== null ? MENTION_TRIGGER.exec(line) : null;
    if (!match) {
      setMentionOpen(false);
      return;
    }
    const items = filterMentions(match[1]);
    if (items.length === 0) {
      setMentionOpen(false);
      return;
    }
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
      height: caret.height || fontSize * 1.5,
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
      highlightCommand(editor, isSlashCommand);
      editor.focus();
      updateHint();
    }
  };

  // Swap the typed "@<frag>" for the chosen "@<insert> " and keep editing so the
  // user can continue the prompt right after the reference.
  const insertMention = (item: MentionItem) => {
    const editor = editorRef.current;
    setMentionOpen(false);
    if (!editor) return;
    if (replaceMentionFragment(editor, item.insert)) {
      histIdx.current = -1;
      normalizeComposer(editor);
      syncState();
      editor.focus();
    }
  };

  // Apply a composer action: send the current text through the user's AI CLI
  // with the action's instruction, then rebuild the field from the result —
  // reusing the history-entry path so any preserved image tokens become chips.
  const runAction = async (action: ComposerAction) => {
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
    try {
      // Read the live AI selection at run time — the picker in the manage modal
      // (or any other AI flow) may have changed it since this composer mounted.
      const s = getSettings();
      const cli = (s.aiCli as AICLI) || ai.selectedCLI;
      const model = s.aiModel ?? ai.selectedModel;
      const effort = s.aiEffort ?? ai.selectedEffort;
      const fast = s.aiFast ?? ai.selectedFast;
      const out = await TransformText(
        cwd,
        cli,
        model,
        effort,
        aiEffectiveFast(cli, model, fast),
        action.instruction,
        value,
      );
      const text = typeof out === "string" ? out.trim() : "";
      if (!text) {
        toast.error("AI returned an empty response");
        return;
      }
      if (activeId.current !== startedId) return;
      applyHistoryEntry(editor, { text, images });
      histIdx.current = -1;
    } catch (err) {
      toast.error(`Action failed: ${err}`);
    } finally {
      transforming.current = false;
      setTransformingId(null);
      // Re-seat focus/caret once the field flips back to editable next render.
      requestAnimationFrame(() => {
        const ed = editorRef.current;
        if (ed) {
          ed.focus();
          placeCaretAtEnd(ed);
        }
      });
    }
  };

  const deleteImageChip = (chip: HTMLElement) => {
    imagePaths.current.delete(Number(chip.dataset.img));
    removeChip(chip);
    syncState();
  };

  // Cut/Copy of a selected image chip writes its "[Image #N]" token (not the
  // visible "Image N" label) to the clipboard so it can be pasted back as the
  // image. Cut keeps the path alive (syncState(false)) for that paste-back;
  // any other selection falls through to native copy/cut.
  const handleCopyCut = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    const chip = selectedChip(editor);
    if (!chip) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", `[Image #${chip.dataset.img}]`);
    if (cut) {
      removeChip(chip);
      histIdx.current = -1;
      syncState(false);
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
      if (e.key === "Enter" || e.key === "Tab") {
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
      if (e.key === "Enter" || e.key === "Tab") {
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
    // Keep app-chrome shortcuts (⌘D split, ⌘F find, ⌘1-9 switch project) from
    // firing while typing here. ⌘I still bubbles so it can toggle the composer
    // closed, and plain ⌘T / ⌘W bubble so they open / close the terminal even with
    // the input focused (⌘⇧W above already handled the composer's own tabs); native
    // edit shortcuts (copy/paste/select-all) keep working since we never
    // preventDefault them.
    const guardKey = e.key.toLowerCase();
    const passesThrough =
      guardKey === "i" || (e.metaKey && !e.shiftKey && (guardKey === "t" || guardKey === "w"));
    if ((e.metaKey || e.ctrlKey) && !passesThrough) {
      e.stopPropagation();
    }
    // Any caret move can make WebKit inject stray chars around a chip — the
    // explicit stepping below covers the common case, this cleans the rest
    // (word/line jumps, vertical moves, boundaries) before the next paint.
    if (e.key.startsWith("Arrow")) scheduleNormalize();
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
    // Clicking elsewhere on a chip opens its image full-window. A chip with no
    // mapped path (shouldn't happen) falls back to selecting it as a unit so it
    // can still be deleted with Backspace.
    const chip = target.closest<HTMLElement>("[data-img]");
    if (chip) {
      e.preventDefault();
      const path = imagePaths.current.get(Number(chip.dataset.img));
      if (path) {
        dismissPreview();
        setLightboxPath(path);
      } else {
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
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-img]");
    if (chip === hoverChip.current) return;
    hoverChip.current = chip;
    if (!chip) {
      setPreview(null);
      return;
    }
    const path = imagePaths.current.get(Number(chip.dataset.img));
    setPreview(path ? { path, rect: chip.getBoundingClientRect() } : null);
  };

  // The placeholder is absolutely positioned over the editor's first line, so
  // both must share identical font metrics or the placeholder drifts.
  const textStyle = { fontSize, lineHeight: 1.5 };

  const busy = transformingId !== null;
  const showActions = ai.anyAvailable;
  // Reserve room on the right for the floating button cluster so text never
  // slides under it; each button is 28px wide with a 4px gap.
  const footerButtons = (showActions ? 1 : 0) + 3;
  const editorPadRight = 8 + footerButtons * 28 + (footerButtons - 1) * 4 + 12;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--terminal-bg)] px-3 pb-1 pt-2">
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
        className={`relative rounded-xl bg-[var(--bg-secondary)] transition-colors ${
          busy
            ? "border border-transparent"
            : "border border-[var(--border)] focus-within:border-[var(--text-muted)]"
        }`}
      >
        {dragOver && <TerminalDropOverlay compact label="Drop image to add" />}
        <div
          ref={editorRef}
          contentEditable={!busy}
          suppressContentEditableWarning
          data-terminal-composer
          role="textbox"
          aria-multiline="true"
          aria-label={`Send to ${targetLabel}`}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onInput={() => {
            histIdx.current = -1;
            const editor = editorRef.current;
            if (editor) normalizeComposer(editor);
            syncState();
            if (editor) highlightCommand(editor, isSlashCommand);
            updateSlashMenu();
            updateMentionMenu();
            updateHint();
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
          style={{ ...textStyle, paddingRight: editorPadRight }}
          className="block max-h-[200px] min-h-[60px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-2.5 pl-3.5 text-[var(--text-primary)] outline-none [overflow-wrap:anywhere]"
        />
        {blank && (
          <div
            style={textStyle}
            className="pointer-events-none absolute left-3.5 top-2.5 text-[var(--text-muted)]"
          >
            Send to {targetLabel}…
          </div>
        )}
        {hint && (
          <div
            aria-hidden
            style={{ fontSize, left: hint.left, top: hint.top, height: hint.height, lineHeight: `${hint.height}px` }}
            className="pointer-events-none absolute whitespace-pre text-[var(--text-muted)]"
          >
            {hint.text}
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {showActions && (
            <ComposerActionsButton
              enabledActions={enabledActions}
              busy={busy}
              canRun={!disabled}
              cliLabel={ai.cliLabel}
              onRun={runAction}
              onManage={() => setActionsModalOpen(true)}
            />
          )}
          <button
            type="button"
            onClick={addTab}
            aria-label="New input"
            title="New input"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PlusIcon />
          </button>
          <TerminalHistoryButton
            terminalId={historyKey}
            projectName={projectName}
            terminalLabel={targetLabel}
            onPick={loadFromHistory}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || busy}
            title="Send  ·  ↵"
            aria-label="Send"
            style={
              disabled || busy
                ? undefined
                : { boxShadow: "0 2px 12px -2px color-mix(in srgb, var(--accent-blue) 60%, transparent)" }
            }
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 ${
              disabled || busy
                ? "text-[var(--text-muted)]"
                : "bg-[var(--accent-blue)] text-[var(--bg-primary)] hover:brightness-110 active:scale-90"
            }`}
          >
            <SendIcon />
          </button>
        </div>
      </div>
      </div>
      {preview && <ImagePreviewPopover path={preview.path} anchor={preview.rect} />}
      {lightboxPath && (
        <ImageLightbox path={lightboxPath} onClose={() => setLightboxPath(null)} />
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
        />
      )}
      <ComposerActionsModal open={actionsModalOpen} onClose={() => setActionsModalOpen(false)} />
    </div>
  );
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
