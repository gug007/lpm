import { useState, useEffect, useRef, useCallback } from "react";
import { ReadConfig, SaveConfig } from "../../wailsjs/go/main/App";

interface ConfigEditorProps {
  projectName: string;
  onSaved: (newName: string) => void;
}

export function ConfigEditor({
  projectName,
  onSaved,
}: ConfigEditorProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<() => void>(() => {});

  const dirty = content !== original;

  useEffect(() => {
    ReadConfig(projectName)
      .then((data) => {
        setContent(data);
        setOriginal(data);
      })
      .catch((err) => setError(`Failed to load config: ${err}`));
    textareaRef.current?.focus();
  }, [projectName]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const newName = await SaveConfig(projectName, content);
      setOriginal(content);
      onSaved(newName);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }, [projectName, content, onSaved]);

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
      const newContent =
        content.substring(0, start) + "  " + content.substring(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleTab}
          spellCheck={false}
          className="h-full w-full resize-none bg-[var(--bg-primary)] px-6 py-4 font-mono text-sm leading-relaxed text-[var(--text-primary)] outline-none"
          style={{ tabSize: 2 }}
        />
        {(dirty || error) && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            {error && (
              <span className="text-xs text-[var(--accent-red)]">{error}</span>
            )}
            <span className="text-[10px] text-[var(--text-muted)]">{"\u2318"}S</span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="rounded-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)] shadow-lg transition-all hover:opacity-85 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
