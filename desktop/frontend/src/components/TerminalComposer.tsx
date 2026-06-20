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
import { ReadClipboardFiles, SaveClipboardImage } from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { loadComposerDraft, saveComposerDraft } from "../store/composerDrafts";
import { recordMessage } from "../store/messageHistory";
import { SendIcon } from "./icons";
import { ImagePreviewPopover } from "./ImagePreviewPopover";
import { TerminalHistoryButton } from "./TerminalHistoryButton";
import {
  caretEdges,
  chipAfterCaret,
  chipBeforeCaret,
  createImageChip,
  insertItemsAtCaret,
  isEditorEmpty,
  normalizeStrayChars,
  placeCaretAtEnd,
  presentImageTokens,
  removeChip,
  selectChip,
  serializeEditor,
  setEditorContent,
  splitByImageTokens,
} from "./composerEditor";

interface TerminalComposerProps {
  // Terminal whose draft this composer owns; its draft is persisted per id.
  terminalId: string;
  // Project the target terminal belongs to; tags each sent message in history.
  projectName: string;
  // Whether the composer is actually on screen (false while glancing at a
  // service/browser tab, or while another project is selected). A hidden→shown
  // transition refocuses the input.
  shown: boolean;
  // Label of the terminal that will receive the input.
  targetLabel: string;
  // Terminal font size; the composer text scales to match it.
  fontSize: number;
  // Returns false when the input could not be delivered (e.g. a dead session),
  // so the draft is kept rather than cleared. An array carries ordered segments
  // (text runs and image paths) to be delivered as separate pastes.
  onSubmit: (input: string | string[]) => boolean;
  onClose: () => void;
  onFocusTerminal: () => void;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;

export function TerminalComposer({ terminalId, projectName, shown, targetLabel, fontSize, onSubmit, onClose, onFocusTerminal }: TerminalComposerProps) {
  // `blank` drives the placeholder (no content at all); `disabled` drives the
  // send button (nothing but whitespace).
  const [blank, setBlank] = useState(true);
  const [disabled, setDisabled] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ path: string; rect: DOMRect } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverChip = useRef<HTMLElement | null>(null);
  const history = useRef<string[]>([]);
  // -1 means "the live draft"; 0..n-1 index into history, newest first.
  const histIdx = useRef(-1);
  // [Image #N] index -> local file path, swapped back in when the draft is sent.
  const imagePaths = useRef<Map<number, string>>(new Map());
  const imgCounter = useRef(0);
  const normalizePending = useRef(false);

  // Restore this terminal's saved draft on mount (the composer is remounted per
  // terminal), then focus it — so switching terminals brings back what you'd
  // typed and puts the cursor in the input. useLayoutEffect so the restored text
  // is painted in one frame (no empty-with-placeholder flash).
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const draft = loadComposerDraft(terminalId);
    if (draft) {
      imagePaths.current = new Map(draft.imagePaths);
      imgCounter.current = draft.imgCounter;
      history.current = draft.history.slice();
      histIdx.current = draft.histIdx;
      setEditorContent(editor, draft.text);
      setBlank(isEditorEmpty(editor));
      setDisabled(serializeEditor(editor).trim() === "");
      placeCaretAtEnd(editor);
    }
    editor.focus();
    // Mount-only: the composer is keyed by terminalId, so a new terminal == a
    // fresh mount; terminalId never changes within one instance.
  }, []);

  // Re-show after a glance at a service/browser tab or a switch to another
  // project (no remount, since the composer stays pinned to the last terminal)
  // should refocus the input too.
  const wasShown = useRef(shown);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor && shown && !wasShown.current) {
      editor.focus();
      placeCaretAtEnd(editor);
    }
    wasShown.current = shown;
  }, [shown]);

  const dismissPreview = useCallback(() => {
    hoverChip.current = null;
    setPreview(null);
  }, []);

  // The popover is anchored to a rect captured at hover time, so a window
  // resize (the editor scroll is handled inline) would leave it floating.
  useEffect(() => {
    if (!preview) return;
    window.addEventListener("resize", dismissPreview);
    return () => window.removeEventListener("resize", dismissPreview);
  }, [preview, dismissPreview]);

  // Recompute the placeholder/disabled state and forget image paths whose chip
  // has been deleted, so the map never outlives what's actually in the field.
  const syncState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const value = serializeEditor(editor);
    setBlank(isEditorEmpty(editor));
    setDisabled(value.trim() === "");
    const present = presentImageTokens(editor);
    for (const n of imagePaths.current.keys()) {
      if (!present.has(n)) imagePaths.current.delete(n);
    }
    // Any deletion path (keyboard, select+delete, cut, send) ends here; if the
    // hovered chip is gone, drop its now-orphaned preview.
    if (hoverChip.current && !hoverChip.current.isConnected) {
      hoverChip.current = null;
      setPreview(null);
    }
    // Persist after every mutation so the draft survives a terminal switch.
    saveComposerDraft(terminalId, {
      text: value,
      imagePaths: imagePaths.current,
      imgCounter: imgCounter.current,
      history: history.current,
      histIdx: histIdx.current,
    });
  }, [terminalId]);

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
      if (normalizeStrayChars(editor)) syncState();
    });
  }, [syncState]);

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

  // Image file paths become chips; other paths drop in as plain text.
  const insertImagePaths = useCallback(
    (paths: string[]) =>
      insertItems(paths.map((p) => (IMAGE_EXT_RE.test(p) ? registerImagePath(p) : p))),
    [insertItems, registerImagePath],
  );

  // OS file drops (from Finder) arrive as paths via the shared drop bridge.
  useEffect(() => {
    return registerFileDropHandler("terminal-composer", (x, y, paths) => {
      const el = containerRef.current;
      if (!el || paths.length === 0) return false;
      const r = el.getBoundingClientRect();
      if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return false;
      insertImagePaths(paths);
      setDragOver(false);
      return true;
    });
  }, [insertImagePaths]);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const dt = e.clipboardData;
      if (!dt) return;
      // Raw image bytes (e.g. a screenshot) — the common case.
      const imageItem = Array.from(dt.items).find(
        (it) => it.kind === "file" && it.type.startsWith("image/"),
      );
      if (imageItem) {
        const blob = imageItem.getAsFile();
        if (blob) {
          e.preventDefault();
          void addImageBlob(blob).then((chip) => chip && insertItems([chip]));
          return;
        }
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
      // (or styled chips) into the field.
      e.preventDefault();
      const text = dt.getData("text/plain");
      if (text) {
        document.execCommand("insertText", false, text);
        histIdx.current = -1;
        syncState();
      }
    },
    [addImageBlob, insertImagePaths, insertItems, syncState],
  );

  // In-app / web drags deliver File objects through the DOM (OS file drops go
  // through the bridge handler above instead).
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void Promise.all(files.map((f) => addImageBlob(f))).then((chips) =>
        insertItems(chips.filter((c): c is HTMLSpanElement => c !== null)),
      );
    },
    [addImageBlob, insertItems],
  );

  const send = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const value = serializeEditor(editor);
    if (!value.trim()) return;
    // Split into ordered segments — text runs and resolved image paths — so each
    // image can be delivered as its own paste at the cursor (keeping it in the
    // order the user typed) rather than as a path glued into one big paste, which
    // Claude Code front-loads. A plain string (no images) is sent as one paste.
    const segments = splitByImageTokens(value);
    const hasImages = segments.some((s) => s.image !== null);
    const payload = hasImages
      ? segments
          // Pad each path so it stays a detectable, distinct token even if the
          // receiver concatenates the separate pastes as plain text.
          .map((s) => (s.image === null ? s.text : ` ${imagePaths.current.get(s.image) ?? s.text} `))
          .filter((p) => p.length > 0)
      : value;
    if (!onSubmit(payload)) return;
    // Store the resolved text (real paths) so recalling a past message re-sends
    // the same images without depending on the cleared map. imgCounter stays
    // monotonic so a future chip can never collide with a past index.
    const sent = Array.isArray(payload) ? payload.join(" ") : payload.trimEnd();
    history.current.unshift(sent);
    recordMessage({ text: sent, projectName, terminalId, terminalLabel: targetLabel });
    histIdx.current = -1;
    imagePaths.current.clear();
    setEditorContent(editor, "");
    setPreview(null);
    syncState();
    editor.focus();
  };

  const recall = (delta: 1 | -1): boolean => {
    const editor = editorRef.current;
    const hist = history.current;
    if (!editor || hist.length === 0) return false;
    const next = Math.min(hist.length - 1, Math.max(-1, histIdx.current + delta));
    if (next === histIdx.current) return false;
    histIdx.current = next;
    setEditorContent(editor, next === -1 ? "" : hist[next]);
    syncState();
    placeCaretAtEnd(editor);
    return true;
  };

  // Load a message chosen from the history popover into the field, replacing the
  // current draft. Inserted as plain text (not via setEditorContent) so any
  // literal "[Image #N]" in the stored text can't be re-parsed into a phantom,
  // path-less image chip.
  const loadFromHistory = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.replaceChildren();
    if (text) editor.appendChild(document.createTextNode(text));
    imagePaths.current.clear();
    histIdx.current = -1;
    syncState();
    placeCaretAtEnd(editor);
    editor.focus();
  };

  const deleteImageChip = (chip: HTMLElement) => {
    imagePaths.current.delete(Number(chip.dataset.img));
    removeChip(chip);
    syncState();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    // Keep app-chrome shortcuts (⌘W close tab, ⌘D split, ⌘F find, ⌘1-9 switch
    // project) from firing while typing here. ⌘I still bubbles so it can toggle
    // the composer closed; native edit shortcuts (copy/paste/select-all) keep
    // working since we never preventDefault them.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() !== "i") {
      e.stopPropagation();
    }
    // Any caret move can make WebKit inject stray chars around a chip — the
    // explicit stepping below covers the common case, this cleans the rest
    // (word/line jumps, vertical moves, boundaries) before the next paint.
    if (e.key.startsWith("Arrow")) scheduleNormalize();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      send();
      return;
    }
    if (e.key === "Enter" && e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      document.execCommand("insertText", false, "\n");
      histIdx.current = -1;
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      onFocusTerminal();
      return;
    }
    // A single Backspace/Delete next to a chip removes the whole image at once —
    // the caret can never sit inside a chip, so partial deletion is impossible.
    if (e.key === "Backspace" || e.key === "Delete") {
      const chip = e.key === "Backspace" ? chipBeforeCaret(editor) : chipAfterCaret(editor);
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
    // Clicking elsewhere on a chip selects the whole thing so it reads (and
    // deletes) as a unit.
    const chip = target.closest<HTMLElement>("[data-img]");
    if (chip) selectChip(chip);
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

  return (
    <div className="border-t border-[var(--border)] bg-[var(--terminal-bg)] px-3 pb-1 pt-2">
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
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={handleDrop}
        className={`relative rounded-xl border bg-[var(--bg-secondary)] transition-colors ${
          dragOver
            ? "border-[var(--accent-cyan)]"
            : "border-[var(--border)] focus-within:border-[var(--text-muted)]"
        }`}
      >
        <div
          ref={editorRef}
          contentEditable
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
            if (editorRef.current) normalizeStrayChars(editorRef.current);
            syncState();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={handleClick}
          onMouseOver={handleHover}
          onMouseLeave={dismissPreview}
          onScroll={dismissPreview}
          style={textStyle}
          className="block max-h-[200px] min-h-[60px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent py-2.5 pl-3.5 pr-[5.25rem] text-[var(--text-primary)] outline-none [overflow-wrap:anywhere]"
        />
        {blank && (
          <div
            style={textStyle}
            className="pointer-events-none absolute left-3.5 top-2.5 text-[var(--text-muted)]"
          >
            Send to {targetLabel}…
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <TerminalHistoryButton
            terminalId={terminalId}
            projectName={projectName}
            terminalLabel={targetLabel}
            onPick={loadFromHistory}
          />
          <button
            type="button"
            onClick={send}
            disabled={disabled}
            title="Send  ·  ↵"
            aria-label="Send"
            style={
              disabled
                ? undefined
                : { boxShadow: "0 2px 12px -2px color-mix(in srgb, var(--accent-blue) 60%, transparent)" }
            }
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 ${
              disabled
                ? "text-[var(--text-muted)]"
                : "bg-[var(--accent-blue)] text-[var(--bg-primary)] hover:brightness-110 active:scale-90"
            }`}
          >
            <SendIcon />
          </button>
        </div>
      </div>
      {preview && <ImagePreviewPopover path={preview.path} anchor={preview.rect} />}
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
