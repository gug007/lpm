import { useState, useEffect, useRef, useCallback } from "react";
import { ReadConfig, SaveConfig } from "../../wailsjs/go/main/App";

interface ConfigEditorProps {
  projectName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ConfigEditor({
  projectName,
  onClose,
  onSaved,
}: ConfigEditorProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<() => void>(() => {});
  const closeRef = useRef(onClose);

  const dirty = content !== original;

  closeRef.current = onClose;

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
      await SaveConfig(projectName, content);
      setOriginal(content);
      onSaved();
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
      if (e.key === "Escape") {
        closeRef.current();
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
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {projectName}.yml
          </span>
          {dirty && (
            <span className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-[var(--accent-red)]">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-green)]/20 bg-[var(--accent-green)]/10 px-3 py-1 text-xs font-medium text-[var(--accent-green)] transition-all hover:bg-[var(--accent-green)]/20 active:scale-95 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <span className="text-[10px] text-[var(--text-muted)]">
            {"\u2318"}S
          </span>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleTab}
          spellCheck={false}
          className="h-full w-full resize-none bg-[var(--bg-primary)] p-4 font-mono text-sm leading-relaxed text-[var(--text-primary)] outline-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}
