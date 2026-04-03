import { useState, useEffect, useRef, useCallback } from "react";

export function useYamlEditor(
  load: () => Promise<string>,
  save: (content: string) => Promise<void>,
) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef<() => void>(() => {});

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

  saveRef.current = handleSave;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
