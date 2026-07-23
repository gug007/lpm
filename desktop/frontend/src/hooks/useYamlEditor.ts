import { useState, useEffect, useCallback, useMemo } from "react";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export function useYamlEditor(
  load: () => Promise<string>,
  save: (content: string) => Promise<void>,
  validate?: (content: string) => string | null,
) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== original;
  const validationError = useMemo(
    () => validate?.(content) ?? null,
    [content, validate],
  );

  useEffect(() => {
    load()
      .then((data) => { setContent(data); setOriginal(data); })
      .catch((err) => setError(`Failed to load: ${err}`));
  }, [load]);

  const handleSave = useCallback(async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save(content);
      setOriginal(content);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }, [content, save, validationError]);

  useKeyboardShortcut({ key: "s", meta: true, whileTyping: false }, () => {
    if (dirty) handleSave();
  });

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
    dirty,
    saving,
    error,
    validationError,
    handleSave,
    handleTab,
  };
}
