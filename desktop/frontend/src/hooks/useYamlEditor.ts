import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { chordLetter } from "../keyEvents";
import { isMac } from "../platform";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

// Unsaved edits outlive the editor, the way the Files tab keeps its buffers:
// switching projects or settings pages closes it, and reopened on the same
// file it picks them up again, unless the file changed on disk meanwhile.
const drafts = new Map<string, { content: string; base: string }>();

export function useYamlEditor(
  load: () => Promise<string>,
  save: (content: string) => Promise<void>,
  validate?: (content: string) => string | null,
  draftKey?: string,
) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A failed save's message, kept with the text it was about: once the text
  // changes the message no longer describes it.
  const [saveFailure, setSaveFailure] = useState<{ message: string; content: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const dirty = content !== original;
  const error = loadError ?? (saveFailure?.content === content ? saveFailure.message : null);
  const validationError = useMemo(
    () => validate?.(content) ?? null,
    [content, validate],
  );

  // The draft key the loaded text belongs to, so a key that changes before
  // its file has loaded never takes the previous file's text.
  const loadedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    load()
      .then((data) => {
        const draft = draftKey === undefined ? undefined : drafts.get(draftKey);
        const kept = draft?.base === data ? draft.content : data;
        loadedKey.current = draftKey;
        setContent(kept);
        setOriginal(data);
        setLoaded(true);
      })
      .catch((err) => setLoadError(`Failed to load: ${err}`));
  }, [load, draftKey]);

  useEffect(() => {
    if (!loaded || draftKey === undefined || loadedKey.current !== draftKey) return;
    if (content === original) drafts.delete(draftKey);
    else drafts.set(draftKey, { content, base: original });
  }, [content, original, loaded, draftKey]);

  const discard = useCallback(() => setContent(original), [original]);

  // Puts `next` in the editor and saves it, for content that arrives whole
  // rather than typed (an AI-generated config).
  const saveContent = useCallback(
    async (next: string) => {
      setContent(next);
      const invalid = validate?.(next) ?? null;
      setLoadError(null);
      if (invalid) {
        setSaveFailure({ message: invalid, content: next });
        return;
      }
      setSaving(true);
      setSaveFailure(null);
      try {
        await save(next);
        setOriginal(next);
      } catch (err) {
        setSaveFailure({ message: `${err}`, content: next });
      } finally {
        setSaving(false);
      }
    },
    [save, validate],
  );

  const handleSave = useCallback(() => saveContent(content), [saveContent, content]);

  useKeyboardShortcut({ key: "s", meta: true, whileTyping: false }, () => {
    if (dirty) handleSave();
  });

  // Off macOS the ⌘S above is Ctrl+Shift+S (keys.ts toPhysical); inside the
  // editor plain Ctrl+S saves too, as in any other editor there.
  const handleSaveKey = isMac
    ? undefined
    : (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.defaultPrevented || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
        if (chordLetter(e.nativeEvent) !== "s" || !e.currentTarget.contains(e.target as Node)) return;
        e.preventDefault();
        if (dirty) handleSave();
      };

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + "  " + content.substring(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  return {
    content,
    setContent,
    loaded,
    dirty,
    saving,
    error,
    validationError,
    handleSave,
    saveContent,
    discard,
    handleSaveKey,
    handleTab,
  };
}
