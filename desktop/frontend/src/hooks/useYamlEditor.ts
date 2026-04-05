import { useState, useEffect, useCallback } from "react";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export function useYamlEditor(
  load: () => Promise<string>,
  save: (content: string) => Promise<void>,
) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== original;

  useEffect(() => {
    load()
      .then((data) => { setContent(data); setOriginal(data); })
      .catch((err) => setError(`Failed to load: ${err}`));
  }, [load]);

  const handleSave = useCallback(async () => {
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
  }, [content, save]);

  useKeyboardShortcut({ key: "s", meta: true }, () => {
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

  return { content, setContent, dirty, saving, error, handleSave, handleTab };
}
