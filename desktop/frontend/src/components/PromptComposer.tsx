import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { SaveClipboardImage, NotesReadFileAsInput } from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";

export interface PromptImage {
  id: string;
  name: string;
  url: string;
  path: string;
  error?: boolean;
}

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  images: PromptImage[];
  onImagesChange: Dispatch<SetStateAction<PromptImage[]>>;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_HEIGHT = 200;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      if (b64) resolve(b64);
      else reject(new Error("empty image data"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

// A drop landing inside the composer (vs. elsewhere on the modal) — matches how
// NotesView claims its own drops from the shared native file-drop bridge.
function overComposer(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest("[data-prompt-drop]");
}

export function PromptComposer({
  value,
  onChange,
  images,
  onImagesChange,
  placeholder,
  autoFocus,
}: PromptComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // Preview thumbnails use object URLs; revoke them when the composer unmounts
  // so the blobs don't leak (the saved disk copy is what the agent reads).
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => imagesRef.current.forEach((im) => URL.revokeObjectURL(im.url)),
    [],
  );

  const stage = useCallback(
    (id: string, name: string) =>
      onImagesChange((prev) => [...prev, { id, name, url: "", path: "" }]),
    [onImagesChange],
  );
  const resolve = useCallback(
    (id: string, patch: Partial<PromptImage>) =>
      onImagesChange((prev) =>
        prev.map((im) => (im.id === id ? { ...im, ...patch } : im)),
      ),
    [onImagesChange],
  );
  const fail = useCallback(
    (id: string) => resolve(id, { error: true }),
    [resolve],
  );

  // Pasted/picked blobs: persist to a temp file for the agent, preview from the blob.
  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (!isImage(file)) continue;
        const id = crypto.randomUUID();
        const url = URL.createObjectURL(file);
        onImagesChange((prev) => [
          ...prev,
          { id, name: file.name || "image", url, path: "" },
        ]);
        fileToBase64(file)
          .then((b64) => SaveClipboardImage(b64, file.type))
          .then((path) => resolve(id, { path }))
          .catch(() => fail(id));
      }
    },
    [onImagesChange, resolve, fail],
  );

  // Native OS drops arrive as filesystem paths; the agent reads them in place,
  // so the preview is the only thing we need to load (capped binary read).
  const addPaths = useCallback(
    (paths: string[]): number => {
      let staged = 0;
      for (const p of paths) {
        if (!IMAGE_EXT.test(p)) continue;
        staged++;
        const id = crypto.randomUUID();
        const name = p.split("/").pop() || "image";
        stage(id, name);
        NotesReadFileAsInput(p)
          .then((input: { name: string; mimeType: string; data: string }) => {
            const url = `data:${input.mimeType || "image/png"};base64,${input.data}`;
            resolve(id, { url, path: p, name: input.name || name });
          })
          .catch(() => fail(id));
      }
      return staged;
    },
    [stage, resolve, fail],
  );

  const removeImage = (id: string) =>
    onImagesChange((prev) => {
      const target = prev.find((im) => im.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((im) => im.id !== id);
    });

  // Claim drops that land on the composer from the shared native bridge.
  useEffect(
    () =>
      registerFileDropHandler("prompt-composer", (x, y, paths) => {
        if (!overComposer(x, y)) return false;
        if (addPaths(paths) === 0) toast.error("Only images can be attached");
        return true;
      }),
    [addPaths],
  );

  // Show the drop overlay only while a drag hovers the composer. The native
  // bridge reports position during the drag; paths arrive on drop. Gate `over`
  // behind `enter` so a stale post-drop `over` (which wry can emit) can't
  // re-show the overlay after it's been cleared.
  useEffect(() => {
    let inside = false;
    const onEnter = () => {
      inside = true;
    };
    const onOver = (e: Event) => {
      if (!inside) return;
      const detail = (e as CustomEvent<[number, number]>).detail;
      setDragActive(!!detail && overComposer(detail[0], detail[1]));
    };
    const off = () => {
      inside = false;
      setDragActive(false);
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

  // Bound on the container, not the textarea, so a paste anywhere in the
  // composer is captured. Non-image pastes fall through to the textarea.
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const files = [...e.clipboardData.items]
      .filter((it) => it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  };

  return (
    <div
      data-prompt-drop
      onPaste={onPaste}
      className={`relative mt-2 overflow-hidden rounded-xl border bg-[var(--bg-secondary)] transition-colors ${
        dragActive
          ? "border-[var(--accent-cyan)]"
          : "border-[var(--border)] focus-within:border-[var(--accent-cyan)]"
      }`}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 backdrop-blur-[2px]">
          <ImagePlus size={18} className="text-[var(--accent-cyan)]" />
          <span className="text-[11px] font-medium text-[var(--accent-cyan)]">
            Drop image to attach
          </span>
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2.5 pb-0">
          {images.map((im) => (
            <div
              key={im.id}
              title={
                im.error
                  ? "Couldn't attach this image — remove it and try again."
                  : im.name
              }
              className="relative h-14 w-14 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
            >
              {im.url && (
                <img src={im.url} alt={im.name} className="h-full w-full object-cover" />
              )}
              {!im.path && !im.error && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 size={16} className="animate-spin text-white" />
                </span>
              )}
              {im.error && (
                <span className="absolute inset-0 flex items-center justify-center bg-[var(--accent-red)]/70 text-[10px] font-semibold text-white">
                  Failed
                </span>
              )}
              <button
                type="button"
                onClick={() => removeImage(im.id)}
                aria-label="Remove image"
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        spellCheck={false}
        placeholder={placeholder}
        className="block max-h-[200px] min-h-[60px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-snug text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />

      <div className="flex items-center px-2 pb-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ImagePlus size={13} />
          Add image
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
