import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { ReadClipboardFiles, SaveClipboardImage } from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { SendIcon } from "./icons";

interface TerminalComposerProps {
  // Label of the terminal that will receive the input.
  targetLabel: string;
  // Returns false when the input could not be delivered (e.g. a dead session),
  // so the draft is kept rather than cleared.
  onSubmit: (text: string) => boolean;
  onClose: () => void;
  onFocusTerminal: () => void;
}

// Compact by default, grow with content up to a cap.
const MIN_HEIGHT = 56;
const MAX_HEIGHT = 200;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;
const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

export function TerminalComposer({ targetLabel, onSubmit, onClose, onFocusTerminal }: TerminalComposerProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const history = useRef<string[]>([]);
  // -1 means "the live draft"; 0..n-1 index into history, newest first.
  const histIdx = useRef(-1);
  // [Image #N] placeholder index -> local file path pasted to the terminal on send.
  const imagePaths = useRef<Map<number, string>>(new Map());
  const imgCounter = useRef(0);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT)}px`;
  }, [text]);

  // Reads the live caret + value so it stays correct even when called from a
  // drop handler whose closure captured stale `text`.
  const insertAtCaret = useCallback((insert: string) => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart : null;
    const end = el ? el.selectionEnd : null;
    setText((prev) => {
      const s = start ?? prev.length;
      const e = end ?? prev.length;
      return prev.slice(0, s) + insert + prev.slice(e);
    });
    histIdx.current = -1;
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (start ?? el.value.length) + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const addImagePath = useCallback((path: string) => {
    const n = (imgCounter.current += 1);
    imagePaths.current.set(n, path);
    return `[Image #${n}]`;
  }, []);

  const addImageBlob = useCallback(
    async (blob: Blob): Promise<string | null> => {
      const b64 = await blobToBase64(blob);
      if (!b64) return null;
      try {
        const path = await SaveClipboardImage(b64, blob.type || "image/png");
        return typeof path === "string" && path ? addImagePath(path) : null;
      } catch {
        return null;
      }
    },
    [addImagePath],
  );

  // Image file paths become [Image #N] tokens; other paths drop in as text.
  const insertImagePaths = useCallback(
    (paths: string[]) =>
      insertAtCaret(paths.map((p) => (IMAGE_EXT_RE.test(p) ? addImagePath(p) : p)).join(" ")),
    [addImagePath, insertAtCaret],
  );

  const insertTokens = useCallback(
    (tokens: (string | null)[]) => {
      const joined = tokens.filter(Boolean).join(" ");
      if (joined) insertAtCaret(joined);
    },
    [insertAtCaret],
  );

  // OS file drops (from Finder) arrive as paths via the shared drop bridge.
  // Image files become [Image #N] tokens; other files drop in as path text.
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
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
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
          void addImageBlob(blob).then((token) => insertTokens([token]));
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
      }
      // else: plain text — let the textarea paste normally.
    },
    [addImageBlob, insertImagePaths, insertTokens],
  );

  // In-app / web drags deliver File objects through the DOM (OS file drops go
  // through the bridge handler above instead).
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void Promise.all(files.map((f) => addImageBlob(f))).then(insertTokens);
    },
    [addImageBlob, insertTokens],
  );

  const send = () => {
    const value = text;
    if (!value.trim()) return;
    // Swap each [Image #N] placeholder for its file path so the terminal (e.g.
    // Claude Code) receives the image just as a direct drop/paste would.
    const resolved = value.replace(IMAGE_TOKEN_RE, (m, n) => imagePaths.current.get(Number(n)) ?? m);
    if (!onSubmit(resolved)) return;
    // Store the resolved text (real paths, not [Image #N]) so recalling a past
    // message re-sends the same images without depending on the cleared map.
    // imgCounter stays monotonic so a recalled token can never collide with a
    // freshly-pasted image's index.
    history.current.unshift(resolved);
    histIdx.current = -1;
    imagePaths.current.clear();
    setText("");
    textareaRef.current?.focus();
  };

  const recall = (delta: 1 | -1): boolean => {
    const hist = history.current;
    if (hist.length === 0) return false;
    const next = Math.min(hist.length - 1, Math.max(-1, histIdx.current + delta));
    if (next === histIdx.current) return false;
    histIdx.current = next;
    setText(next === -1 ? "" : hist[next]);
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Keep app-chrome shortcuts (⌘W close tab, ⌘D split, ⌘F find, ⌘1-9 switch
    // project) from firing while typing here. ⌘I still bubbles so it can toggle
    // the composer closed; native edit shortcuts (copy/paste/select-all) keep
    // working since we never preventDefault them.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() !== "i") {
      e.stopPropagation();
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      send();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      onFocusTerminal();
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    const caretCollapsed = el.selectionStart === el.selectionEnd;
    // Treat [Image #N] as one atomic chip: a single Backspace/Delete next to it
    // removes the whole token (and forgets its image), like Claude Code.
    if ((e.key === "Backspace" || e.key === "Delete") && caretCollapsed) {
      const pos = el.selectionStart;
      const value = el.value;
      const m =
        e.key === "Backspace"
          ? value.slice(0, pos).match(/\[Image #(\d+)\]$/)
          : value.slice(pos).match(/^\[Image #(\d+)\]/);
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        const removeStart = e.key === "Backspace" ? pos - m[0].length : pos;
        imagePaths.current.delete(Number(m[1]));
        setText(value.slice(0, removeStart) + value.slice(removeStart + m[0].length));
        histIdx.current = -1;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(removeStart, removeStart);
        });
        return;
      }
    }
    if (e.key === "ArrowUp" && caretCollapsed && el.selectionStart === 0) {
      if (recall(1)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (
      e.key === "ArrowDown" &&
      caretCollapsed &&
      el.selectionStart === el.value.length &&
      histIdx.current !== -1
    ) {
      if (recall(-1)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--terminal-bg)] px-3 pb-1 pt-2">
      <div
        ref={containerRef}
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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            histIdx.current = -1;
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={2}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={`Send to ${targetLabel}…`}
          className="block w-full resize-none bg-transparent py-2.5 pl-3.5 pr-12 text-[13px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          title="Send  ·  ↵"
          aria-label="Send"
          className={`absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
            text.trim()
              ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 active:scale-95"
              : "text-[var(--text-muted)]"
          }`}
        >
          <SendIcon />
        </button>
      </div>
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
