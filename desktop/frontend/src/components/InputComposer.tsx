import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  FileExists,
  ListDirs,
  ReadClipboardFiles,
  SaveClipboardImage,
  TransformText,
} from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { useAIPicker } from "../hooks/useAIPicker";
import {
  useEnabledComposerActions,
  type ComposerAction,
} from "../store/composerActions";
import { generateVariants, resolveTransformParams } from "../composerVariants";
import { isCanceledError, useAIGeneration } from "../hooks/useAIGeneration";
import { ComposerActionsButton } from "./ComposerActionsButton";
import { ComposerMicButton } from "./ComposerMicButton";
import { DICTATION_AVAILABLE } from "../hooks/useVoiceDictation";
import { ComposerActionsModal } from "./ComposerActionsModal";
import { ComposerVariantsModal } from "./ComposerVariantsModal";
import { TerminalHistoryButton } from "./TerminalHistoryButton";
import { InputComposerMemory } from "./InputComposerMemory";
import {
  useInputComposerMemory,
  type InputComposerMemorySource,
} from "../hooks/useInputComposerMemory";
import { TerminalDropOverlay } from "./terminal/TerminalDropOverlay";
import { loadImageDataUrl } from "./imageDataUrl";
import {
  caretOffsetInSerialized,
  chipAfterCaret,
  chipBeforeCaret,
  createImageChip,
  EMPTY_COMPOSER,
  insertItemsAtCaret,
  isEditorEmpty,
  isImagePath,
  normalizeComposer,
  payloadToItems,
  placeCaretAtEnd,
  placeCaretAtSerializedOffset,
  placeCaretFromPoint,
  presentImageTokens,
  relabelImageChips,
  removeChip,
  renderFileChip,
  renderFolderChip,
  selectedChip,
  selectionClipboardPayload,
  serializeEditor,
  setChipThumbnail,
  setEditorContent,
  settleSelection,
  splitByImageTokens,
  type ComposerImage,
  type ComposerValue,
} from "./composerEditor";
import {
  deleteBeside,
  deleteSelection,
  extendSelection,
  insertLineBreak,
  insertPlainText,
  stepCaret,
} from "./composerEditKeys";
import { composerDragActive, useComposerDragMove } from "../hooks/useComposerDragMove";
import {
  readClipboardPayload,
  writeClipboardPayload,
} from "./composerClipboard";
import { composerChord, isFormatChord } from "./composerKeys";
import { useComposerUndo } from "../hooks/useComposerUndo";
import { isImeComposing } from "../imeComposing";

export { EMPTY_COMPOSER };
export type { ComposerImage, ComposerValue };

// Recalls past prompts for a project; when set the composer shows a history
// button that loads an entry back into the field.
export interface ComposerHistory {
  terminalId: string;
  projectName: string;
  terminalLabel: string;
}

interface InputComposerProps {
  // Seed applied once on mount — restores text + chips when the composer is
  // remounted (e.g. after being hidden). Not a controlled value: re-renders
  // don't reset the editor, so the caret is never disturbed.
  defaultValue?: ComposerValue;
  onChange?: (value: ComposerValue) => void;
  placeholder?: string;
  autoFocus?: boolean;
  // Bumped to move the keyboard into the field, the caret at the end.
  focusRequest?: number;
  // When set, plain ↵ submits through it; Shift+↵ still adds a line.
  onSubmit?: () => void;
  // "terminal" frames the box like the terminal's own composer: flush with
  // what's above it and focusing quietly. Dialogs keep the accent focus.
  tone?: "dialog" | "terminal";
  // When set, a message-history button recalls past prompts for this project.
  history?: ComposerHistory;
  // Working directory AI-edit transforms run in (the project root). When set, an
  // AI-actions button transforms the prompt in place.
  aiCwd?: string;
  // When set, a memory button writes an lpm-memory invocation into the prompt.
  memory?: InputComposerMemorySource;
  // Host controls placed inside the box above the field.
  header?: ReactNode;
  // Host controls placed on the composer's own footer row, after the built-in
  // buttons, so the box keeps a single row instead of stacking a second one.
  footer?: ReactNode;
  // Locks the field: nothing can be typed and no AI action can run.
  disabled?: boolean;
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

// A drop landing inside *this* composer's box (vs. elsewhere on the page, or a
// sibling composer) — the shared native file-drop bridge reports a point, and
// only the composer the point actually falls in claims the drop.
function pointInBox(box: HTMLElement | null, x: number, y: number): boolean {
  const target = document.elementFromPoint(x, y);
  return !!box && !!target && box.contains(target);
}

export function InputComposer({
  defaultValue,
  onChange,
  placeholder,
  autoFocus,
  focusRequest,
  onSubmit,
  tone = "dialog",
  history,
  aiCwd,
  memory,
  header,
  footer,
  disabled,
}: InputComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // [Image #N] token -> local file path, mirrored out in the value.
  const imagePaths = useRef<Map<number, string>>(new Map());
  const imgCounter = useRef(0);
  // Number of image saves in flight; drives `pending` so a consumer can wait.
  const saving = useRef(0);
  const normalizePending = useRef(false);
  const dropId = useId();
  const [blank, setBlank] = useState(!defaultValue?.text);
  const [canRun, setCanRun] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // AI-edit: the action transform in flight (locks the field), if any.
  const [transformingId, setTransformingId] = useState<string | null>(null);
  const gen = useAIGeneration(history?.projectName ?? aiCwd);
  const [actionsModalOpen, setActionsModalOpen] = useState(false);
  // Set while the multi-result variant picker is open; holds the rewrites plus
  // the image map to rehydrate whichever one the user commits.
  const [variants, setVariants] = useState<{
    label: string;
    list: string[];
    images: Record<string, string>;
  } | null>(null);
  // Guards runAction against re-entry across the AI await.
  const transforming = useRef(false);
  const ai = useAIPicker(!!aiCwd, history?.projectName ?? aiCwd);
  const enabledActions = useEnabledComposerActions();
  const busy = transformingId !== null;
  // A transform in flight and a host lock both freeze the field; only the
  // transform gets the actions button's spinner.
  const editable = !busy && !disabled;
  const showActions = !!aiCwd && ai.anyAvailable;
  const memoryState = useInputComposerMemory(memory, editorRef);
  const { highlight } = memoryState;

  const report = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = serializeEditor(editor);
    setBlank(isEditorEmpty(editor));
    setCanRun(text.trim() !== "");
    const present = presentImageTokens(editor);
    const images: ComposerImage[] = [];
    for (const [token, path] of imagePaths.current) {
      if (present.has(token)) images.push({ token, path });
    }
    onChange?.({ text, images, pending: saving.current > 0 });
  }, [onChange]);

  // Give each image chip its thumbnail (lazily): load it from the file path and
  // paint it in, or re-skin a non-image file as a name + type glyph. A chip is
  // marked once handled so repeated syncs are cheap.
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
        void FileExists(path)
          .then((isFile) => (isFile ? false : ListDirs(path).then(() => true)))
          .then((isDir) => {
            if (isDir && chip.isConnected) renderFolderChip(chip);
          })
          .catch(() => {});
        return;
      }
      chip.dataset.thumb = "pending";
      loadImageDataUrl(path)
        .then((url) => {
          if (chip.isConnected) setChipThumbnail(chip, url);
        })
        .catch(() => {
          chip.dataset.thumb = "failed";
        });
    });
    relabelImageChips(editor, (chip) => isImagePath(imagePaths.current.get(Number(chip.dataset.img)) ?? ""));
  }, []);

  // Recompute the placeholder state, forget paths whose chip was deleted, paint
  // any new chips, and mirror the value out.
  const syncState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const present = presentImageTokens(editor);
    for (const n of imagePaths.current.keys()) {
      if (!present.has(n)) imagePaths.current.delete(n);
    }
    hydrateChips();
    report();
    highlight();
  }, [hydrateChips, report, highlight]);

  // After a caret move WebKit may inject stray chars around a chip; clean them in
  // a rAF (before the next paint) rather than on input — caret moves fire none.
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

  const registerImagePath = useCallback((path: string): HTMLSpanElement => {
    const n = (imgCounter.current += 1);
    imagePaths.current.set(n, path);
    const chip = createImageChip(n);
    if (!isImagePath(path)) renderFileChip(chip, path);
    return chip;
  }, []);

  const insertItems = useCallback(
    (items: Array<HTMLElement | string>, separate = true) => {
      const editor = editorRef.current;
      if (!editor || items.length === 0) return;
      // Its own undo step: programmatic insertion fires no input event.
      edits.commit();
      insertItemsAtCaret(editor, items, separate);
      syncState();
      edits.commit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- edits is stable
    [syncState],
  );

  const insertImageChips = useCallback(
    (chips: Array<HTMLSpanElement | null>, attempted: number) => {
      const ok = chips.filter((c): c is HTMLSpanElement => c !== null);
      insertItems(ok);
      const failed = attempted - ok.length;
      if (failed > 0)
        toast.error(
          failed === 1 ? "Couldn't add image" : `Couldn't add ${failed} images`,
        );
    },
    [insertItems],
  );

  const insertFilePaths = useCallback(
    (paths: string[]) => insertItems(paths.map(registerImagePath)),
    [insertItems, registerImagePath],
  );

  const addImageBlob = useCallback(
    async (blob: Blob): Promise<HTMLSpanElement | null> => {
      const b64 = await blobToBase64(blob);
      if (!b64) return null;
      try {
        const path = await SaveClipboardImage(b64, blob.type || "image/png");
        return typeof path === "string" && path
          ? registerImagePath(path)
          : null;
      } catch {
        return null;
      }
    },
    [registerImagePath],
  );

  // Save a batch of image blobs (paste / picker), then drop the chips in at the
  // caret. `saving` is held across the awaits so `pending` reads true meanwhile.
  const addBlobs = useCallback(
    async (blobs: File[]) => {
      if (blobs.length === 0) return;
      saving.current += 1;
      report();
      try {
        const chips = await Promise.all(blobs.map((b) => addImageBlob(b)));
        insertImageChips(chips, blobs.length);
      } finally {
        saving.current -= 1;
        report();
      }
    },
    [addImageBlob, insertImageChips, report],
  );

  const deleteImageChip = (chip: HTMLElement) => {
    edits.commit();
    imagePaths.current.delete(Number(chip.dataset.img));
    removeChip(chip);
    syncState();
    edits.commit();
  };

  // Replace the whole field from a serialized value + its token→path map (used
  // by history recall and AI-edit). Rebuilds chips from the `[Image #N]` tokens.
  const applyHistoryEntry = useCallback(
    (text: string, images: Record<string, string>) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.replaceChildren();
      imagePaths.current = new Map();
      let maxIdx = 0;
      for (const seg of splitByImageTokens(text)) {
        const path = seg.image === null ? undefined : images[seg.image];
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
    },
    [syncState],
  );

  // ⌘Z walks the field's own snapshots: its chips, caret anchors and line breaks
  // are edited through the DOM, outside WebKit's native history.
  const edits = useComposerUndo({
    editorRef,
    read: () => {
      const editor = editorRef.current;
      if (!editor) return null;
      const present = presentImageTokens(editor);
      return {
        text: serializeEditor(editor),
        images: Object.fromEntries([...imagePaths.current].filter(([token]) => present.has(token))),
        caret: caretOffsetInSerialized(editor),
      };
    },
    apply: (snap) => {
      const editor = editorRef.current;
      if (!editor) return;
      applyHistoryEntry(snap.text, snap.images);
      if (snap.caret !== null) placeCaretAtSerializedOffset(editor, snap.caret);
      highlight();
    },
    locked: () => transforming.current,
  });

  // Replace the field with a recalled or rewritten prompt as its own undo step,
  // so ⌘Z brings back what it replaced.
  const replaceField = useCallback(
    (text: string, images: Record<string, string>) => {
      edits.commit();
      applyHistoryEntry(text, images);
      edits.commit();
    },
    [edits, applyHistoryEntry],
  );

  const loadFromHistory = useCallback(
    (text: string, images: Record<string, string>) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      replaceField(text, images);
    },
    [replaceField],
  );

  // Release the transform lock and re-seat focus once the field is editable.
  const endTransform = useCallback(() => {
    transforming.current = false;
    setTransformingId(null);
    requestAnimationFrame(() => {
      const ed = editorRef.current;
      if (ed) {
        ed.focus();
        placeCaretAtEnd(ed);
      }
    });
  }, []);

  // AI-edit: run a composer action's instruction over the current prompt and
  // swap the rewrite back in. The field is locked while it's in flight — and,
  // for a multi-result run, stays locked until a variant is committed.
  const runAction = useCallback(
    async (action: ComposerAction, count = 1) => {
      const editor = editorRef.current;
      if (!editor || transforming.current || !aiCwd) return;
      const value = serializeEditor(editor);
      if (!value.trim()) return;
      const images = Object.fromEntries(imagePaths.current);
      transforming.current = true;
      setTransformingId(action.id);
      // Multiple rewrites open the picker; the field stays untouched until one is
      // chosen, so skip the field-refocus that the single-result path needs.
      let openedPicker = false;
      try {
        const params = resolveTransformParams(ai);
        if (count <= 1) {
          const out = await gen.run((genId) =>
            TransformText(
              history?.projectName ?? null,
              aiCwd,
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
          replaceField(text, images);
        } else {
          const list = await gen.runAll(count, (genIds) =>
            generateVariants(history?.projectName ?? null, aiCwd, params, action.instruction, value, count, genIds),
          );
          if (list.length === 0) {
            toast.error("AI returned an empty response");
            return;
          }
          openedPicker = true;
          setVariants({ label: action.label, list, images });
        }
      } catch (err) {
        if (!isCanceledError(err)) toast.error(`Action failed: ${err}`);
      } finally {
        if (!openedPicker) endTransform();
      }
    },
    [aiCwd, ai, gen, replaceField, endTransform],
  );

  const chooseVariant = useCallback(
    (text: string) => {
      const images = variants?.images ?? {};
      setVariants(null);
      replaceField(text, images);
      endTransform();
    },
    [variants, replaceField, endTransform],
  );

  const closeVariants = useCallback(() => {
    setVariants(null);
    endTransform();
  }, [endTransform]);

  // Seed from defaultValue (mount only) and report the initial state.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (defaultValue && defaultValue.text) {
      imgCounter.current = defaultValue.images.reduce(
        (m, im) => Math.max(m, im.token),
        0,
      );
      defaultValue.images.forEach((im) =>
        imagePaths.current.set(im.token, im.path),
      );
      setEditorContent(editor, defaultValue.text);
      hydrateChips();
    }
    if (autoFocus) {
      editor.focus();
      placeCaretAtEnd(editor);
    }
    syncState();
    edits.reset();
    // Mount-only: defaultValue is a seed, never re-applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!focusRequest || !editor) return;
    editor.focus({ preventScroll: true });
    placeCaretAtEnd(editor);
  }, [focusRequest]);

  useComposerDragMove(editorRef, boxRef);

  // OS (Finder) drops arrive as paths via the shared drop bridge; claim them when
  // they land on this composer and seat the caret where they fell.
  useEffect(
    () =>
      registerFileDropHandler(dropId, (x, y, paths) => {
        if (paths.length === 0 || !pointInBox(boxRef.current, x, y))
          return false;
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
          placeCaretFromPoint(editor, x, y);
        }
        insertFilePaths(paths);
        setDragOver(false);
        return true;
      }),
    [dropId, insertFilePaths],
  );

  // Native (Finder) drags don't raise DOM dragover in the webview — the runtime
  // republishes them as app:* events — so drive the overlay off those, gating
  // `over` behind `enter` to ignore a stale post-drop `over`.
  useEffect(() => {
    let inside = false;
    const onEnter = () => {
      inside = true;
    };
    const onOver = (e: Event) => {
      if (!inside) return;
      const detail = (e as CustomEvent<[number, number]>).detail;
      setDragOver(!!detail && !composerDragActive() && pointInBox(boxRef.current, detail[0], detail[1]));
    };
    const off = () => {
      inside = false;
      setDragOver(false);
    };
    window.addEventListener("app:handleDragEnter", onEnter);
    window.addEventListener("app:handleDragOver", onOver);
    window.addEventListener("app:handleDragLeave", off);
    window.addEventListener("app:filesDropped", off);
    return () => {
      window.removeEventListener("app:handleDragEnter", onEnter);
      window.removeEventListener("app:handleDragOver", onOver);
      window.removeEventListener("app:handleDragLeave", off);
      window.removeEventListener("app:filesDropped", off);
    };
  }, []);

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const dt = e.clipboardData;
    if (!dt) return;
    // Raw image bytes (screenshots) — the common case.
    const imageBlobs = Array.from(dt.items)
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((b): b is File => b !== null);
    if (imageBlobs.length > 0) {
      e.preventDefault();
      void addBlobs(imageBlobs);
      return;
    }
    // Copied files (WebKit often omits the MIME) — resolve real paths.
    if (dt.types.includes("Files") || dt.files.length > 0) {
      e.preventDefault();
      void ReadClipboardFiles()
        .then((paths) => {
          if (Array.isArray(paths) && paths.length > 0) insertFilePaths(paths);
        })
        .catch(() => {});
      return;
    }
    // A copy made in any lpm composer this app run resolves to its token→path
    // payload via the copy registry: rebuild text + chips from it (with fresh
    // tokens), so a prompt pastes whole across composers.
    const payload = readClipboardPayload(dt);
    if (payload) {
      e.preventDefault();
      insertItems(payloadToItems(payload, registerImagePath), false);
      return;
    }
    // Plain text — insert verbatim so rich clipboard HTML can't leak markup. A
    // pasted "[Image #N]" token whose path is still mapped rebuilds the chip.
    e.preventDefault();
    const text = dt.getData("text/plain");
    if (!text) return;
    const segments = splitByImageTokens(text);
    if (
      segments.some((s) => s.image !== null && imagePaths.current.has(s.image))
    ) {
      insertItems(
        segments
          .map((s) =>
            s.image !== null && imagePaths.current.has(s.image)
              ? createImageChip(s.image)
              : s.text,
          )
          .filter((it) => typeof it !== "string" || it.length > 0),
        false,
      );
      return;
    }
    insertPlainText(editorRef.current!, text, "insertFromPaste");
  };

  // Same clipboard contract as the terminal composer: a selection holding chips
  // copies as token text plus an HTML flavor referencing the token→path map, so
  // the images survive a paste into any composer. A chip-free selection stays
  // native; cut deletes through execCommand so onInput does the bookkeeping —
  // except a chip-only selection, which WebKit refuses to delete natively (it
  // collapses the selection instead; see selectedChip) and is removed explicitly.
  const handleCopyCut = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    const payload = selectionClipboardPayload(editor, imagePaths.current);
    if (!payload) return;
    e.preventDefault();
    writeClipboardPayload(e.clipboardData, payload);
    if (!cut) return;
    const chip = selectedChip(editor);
    if (chip) deleteImageChip(chip);
    else if (!deleteSelection(editor, "deleteByCut")) document.execCommand("delete");
  };

  // In-app / web drags deliver File objects through the DOM (OS file drops go
  // through the bridge handler above instead).
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    e.preventDefault();
    const { clientX, clientY } = e;
    saving.current += 1;
    report();
    void Promise.all(files.map((f) => addImageBlob(f)))
      .then((chips) => {
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
          placeCaretFromPoint(editor, clientX, clientY);
        }
        insertImageChips(chips, files.length);
      })
      .finally(() => {
        saving.current -= 1;
        report();
      });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (isFormatChord(e.nativeEvent)) {
      e.preventDefault();
      return;
    }
    // ⌘Z/⌘⇧Z when one reaches keydown, and Ctrl+Z/Ctrl+Y off macOS: always the
    // field's own history, never WebKit's.
    const chord = composerChord(e.nativeEvent);
    const metaZ = e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "z";
    if (chord === "undo" || chord === "redo" || metaZ) {
      e.preventDefault();
      e.stopPropagation();
      if (transforming.current) return;
      if (chord === "redo" || (metaZ && e.shiftKey)) edits.redo();
      else edits.undo();
      return;
    }
    if (onSubmit && e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
      e.preventDefault();
      onSubmit();
      return;
    }
    // Shift+Enter inserts a newline; plain Enter bubbles so the host (e.g. a
    // dialog) can submit on it.
    if (e.key === "Enter" && e.shiftKey && !isImeComposing(e)) {
      e.preventDefault();
      e.stopPropagation();
      insertLineBreak(editor);
      return;
    }
    // A single Backspace/Delete next to a chip removes the whole image at once —
    // the caret can never sit inside a chip, so partial deletion is impossible.
    // A line break, or text behind a caret anchor, deletes through the DOM
    // (composerEditKeys.ts).
    if (e.key === "Backspace" || e.key === "Delete") {
      const dir = e.key === "Backspace" ? "backward" : "forward";
      const chip =
        selectedChip(editor) ??
        (dir === "backward" ? chipBeforeCaret(editor) : chipAfterCaret(editor));
      const plain = !e.altKey && !e.metaKey && !e.ctrlKey;
      const inputType = dir === "backward" ? "deleteContentBackward" : "deleteContentForward";
      if (chip) deleteImageChip(chip);
      if (chip || (plain && (deleteSelection(editor, inputType) || deleteBeside(editor, dir)))) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.metaKey && !e.altKey && !e.ctrlKey) {
      const dir = e.key === "ArrowLeft" ? "backward" : "forward";
      if (e.shiftKey ? extendSelection(editor, dir) : stepCaret(editor, dir)) {
        e.preventDefault();
        return;
      }
    }
    // Caret moves around an atomic chip can leave stray chars; clean after paint.
    if (e.key.startsWith("Arrow")) scheduleNormalize();
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Clicking a chip's thumbnail (which shows an "×" on hover) drops the image.
    const removeBtn = target.closest<HTMLElement>("[data-img-remove]");
    if (removeBtn) {
      e.preventDefault();
      const chip = removeBtn.closest<HTMLElement>("[data-img]");
      if (chip) {
        deleteImageChip(chip);
        editorRef.current?.focus();
      }
      return;
    }
    // A click lands the caret flush against a chip, where WebKit mispaints it,
    // or a selection gesture starts at one; seat it once the click settles.
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor) settleSelection(editor);
    });
  };

  return (
    <>
      <div
        ref={boxRef}
        data-composer-box
        onDrop={handleDrop}
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
        className={`relative rounded-xl border border-[var(--composer-border)] bg-[var(--composer-surface)] transition-colors ${
          tone === "terminal"
            ? "focus-within:border-[var(--composer-border-focus)]"
            : "mt-2 focus-within:border-[var(--accent-cyan)]"
        }`}
      >
        {dragOver && <TerminalDropOverlay compact label="Drop files to add" />}

        {header}
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable={editable}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onInput={(e) => {
              const editor = editorRef.current;
              if (editor && !(e.nativeEvent as InputEvent).isComposing) normalizeComposer(editor);
              edits.noteEdit(e.nativeEvent as InputEvent);
              syncState();
            }}
            onCompositionEnd={() => {
              const editor = editorRef.current;
              if (editor && normalizeComposer(editor)) syncState();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCopy={(e) => handleCopyCut(e, false)}
            onCut={(e) => handleCopyCut(e, true)}
            onClick={handleClick}
            className="block max-h-[200px] min-h-[60px] w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2.5 text-[13px] leading-snug text-[var(--text-primary)] outline-none [overflow-wrap:anywhere]"
          />

          {blank && placeholder && (
            <div className="pointer-events-none absolute left-3 top-2.5 whitespace-pre-line text-[13px] leading-snug text-[var(--text-muted)]">
              {placeholder}
            </div>
          )}
        </div>

        <div className="flex items-center justify-start gap-1 px-2 pb-2">
          {DICTATION_AVAILABLE && <ComposerMicButton into={editorRef} disabled={disabled} />}
          {showActions && (
            <ComposerActionsButton
              align="left"
              enabledActions={enabledActions}
              busy={busy}
              onStop={gen.generating ? gen.cancel : undefined}
              canRun={canRun && !disabled}
              cliLabel={ai.cliLabel}
              onRun={runAction}
              onManage={() => setActionsModalOpen(true)}
            />
          )}
          {history && !disabled && (
            <TerminalHistoryButton
              terminalId={history.terminalId}
              projectName={history.projectName}
              terminalLabel={history.terminalLabel}
              onPick={loadFromHistory}
            />
          )}
          {memory && memoryState.enabled && !disabled && (
            <InputComposerMemory
              {...memory}
              state={memoryState}
              editorRef={editorRef}
              onInserted={syncState}
            />
          )}
          {footer}
        </div>
      </div>
      {aiCwd && (
        <ComposerActionsModal
          open={actionsModalOpen}
          onClose={() => setActionsModalOpen(false)}
        />
      )}
      <ComposerVariantsModal
        open={variants !== null}
        actionLabel={variants?.label ?? ""}
        variants={variants?.list ?? []}
        onChoose={chooseVariant}
        onClose={closeVariants}
      />
    </>
  );
}
