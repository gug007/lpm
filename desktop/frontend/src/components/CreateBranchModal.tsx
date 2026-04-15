import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon, ChevronDownIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import { AICLIMenu } from "./ui/AICLIMenu";
import {
  CheckAICLIs,
  GenerateBranchName,
} from "../../wailsjs/go/main/App";
import { EventsEmit } from "../../wailsjs/runtime/runtime";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { AI_CLI_OPTIONS, aiDefaultModel, aiPickLabel, resolveAIPick, type AICLI } from "../types";
import { getSettings, saveSettings } from "../settings";

interface CreateBranchModalProps {
  open: boolean;
  busy: boolean;
  projectPath: string;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function CreateBranchModal({
  open,
  busy,
  projectPath,
  onClose,
  onCreate,
}: CreateBranchModalProps) {
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState<AICLI>(
    () => (getSettings().aiCli as AICLI) || "claude",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => getSettings().aiModel ?? aiDefaultModel("claude"),
  );
  const [cliMenuOpen, setCLIMenuOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  const cliRef = useOutsideClick<HTMLDivElement>(
    () => setCLIMenuOpen(false),
    cliMenuOpen,
  );

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    let cancelled = false;
    setName("");
    setGenerating(false);
    setCLIMenuOpen(false);
    setTimeout(() => nameRef.current?.focus(), 50);
    CheckAICLIs()
      .then((a) => {
        if (cancelled) return;
        const avail: Record<string, boolean> = {
          claude: a.claude,
          codex: a.codex,
          gemini: a.gemini,
          opencode: a.opencode,
        };
        setAiCLIs(avail);
        const s = getSettings();
        const pick = resolveAIPick(s.aiCli, s.aiModel, avail);
        if (pick) {
          setSelectedCLI(pick.cli);
          setSelectedModel(pick.model);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);

  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9/_.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const canCreate = !busy && !generating && name.trim().length > 0;

  const generate = async () => {
    if (generating || !projectPath) return;
    setGenerating(true);
    try {
      const result = await GenerateBranchName(projectPath, selectedCLI, selectedModel);
      if (!openRef.current) return;
      if (result) setName(normalize(result));
    } catch (err) {
      if (openRef.current) toast.error(`Branch name generation failed: ${err}`);
    } finally {
      if (openRef.current) setGenerating(false);
    }
  };

  const submit = async () => {
    if (!canCreate) return;
    const cleaned = normalize(name);
    if (!cleaned) return;
    await onCreate(cleaned);
  };

  const selectedCLILabel = aiPickLabel(selectedCLI, selectedModel);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy && !generating}
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[440px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Create and checkout branch
        </h3>
        <button
          onClick={onClose}
          disabled={busy || generating}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          Branch name
        </label>
        <div
          className={`relative rounded-lg transition-all ${
            generating
              ? "p-[1px] [background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
              : "border border-[var(--border)] focus-within:border-[var(--text-muted)]"
          }`}
        >
          <div className="flex flex-col rounded-[calc(0.5rem-1px)] bg-[var(--bg-secondary)]">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="new-branch"
              disabled={busy || generating}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`w-full bg-transparent px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                anyAiAvailable ? "pt-2 pb-1" : "py-2"
              }`}
            />
            {anyAiAvailable && (
              <div className="flex items-center justify-end px-2 pb-1.5">
                <div ref={cliRef} className="relative">
                  <AIButton
                    onClick={generate}
                    disabled={generating || busy || !projectPath}
                    loading={generating}
                    title={`Generate with ${selectedCLILabel}`}
                    trailing={
                      <button
                        onClick={() => setCLIMenuOpen(!cliMenuOpen)}
                        disabled={generating || busy}
                        title="Select AI CLI"
                      >
                        <ChevronDownIcon />
                      </button>
                    }
                  >
                    {generating ? "Generating..." : "Generate with AI"}
                  </AIButton>
                  {cliMenuOpen && (
                    <AICLIMenu
                      aiCLIs={aiCLIs}
                      selectedCLI={selectedCLI}
                      selectedModel={selectedModel}
                      onSelect={(cli, model) => {
                        setSelectedCLI(cli);
                        setSelectedModel(model);
                        setCLIMenuOpen(false);
                        saveSettings({ aiCli: cli, aiModel: model });
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        {anyAiAvailable ? (
          <button
            onClick={() => {
              EventsEmit("navigate-branch-instructions");
              onClose();
            }}
            className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Edit AI Instructions
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy || generating}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Close
          </button>
          <button
            onClick={submit}
            disabled={!canCreate}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating\u2026" : "Create and checkout"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
