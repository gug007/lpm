"use client";

import { useState } from "react";
import { DownloadLink } from "@/components/download-link";
import {
  ArrowRight,
  Monitor,
  Palette,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  claudeColors,
  claudeItems,
  claudePresets,
  codexItems,
  codexPresets,
  meterStyles,
  separators,
  type ClaudeColorId,
  type MeterStyleId,
  type Platform,
  type SeparatorId,
  type StatuslineItem,
} from "./statusline-data";
import { StatuslineAddItems } from "./statusline-add-items";
import { StatuslineClaudeAppearance } from "./statusline-claude-appearance";
import { StatuslineCodexAppearance } from "./statusline-codex-appearance";
import { StatuslineItemList } from "./statusline-item-list";
import { StatuslinePresets } from "./statusline-presets";
import {
  StatuslineTerminalPreview,
  type StatuslineSegment,
} from "./statusline-terminal-preview";

const platformButtonClass =
  "flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

const CODEX_ACCENTS = ["text-emerald-300", "text-cyan-300", "text-zinc-400"];

const initialClaudeColors: Record<string, ClaudeColorId> = {
  folder: "cyan",
  path: "blue",
  model: "claude",
  branch: "magenta",
  ctx: "green",
  five: "green",
  seven: "yellow",
  cost: "yellow",
  text: "default",
};

export default function LpmStatuslineDemo() {
  const [platform, setPlatform] = useState<Platform>("claude");
  const [claudeSelected, setClaudeSelected] = useState([
    "folder",
    "model",
    "ctx",
    "five",
    "seven",
    "cost",
  ]);
  const [codexSelected, setCodexSelected] = useState([
    "model-with-reasoning",
    "current-dir",
  ]);
  const [editingClaudeItem, setEditingClaudeItem] = useState("model");
  const [claudeItemColors, setClaudeItemColors] =
    useState(initialClaudeColors);
  const [separator, setSeparator] = useState<SeparatorId>("dot");
  const [meterStyle, setMeterStyle] = useState<MeterStyleId>("bar");
  const [showIcons, setShowIcons] = useState(true);
  const [showGitStatus, setShowGitStatus] = useState(true);
  const [codexColors, setCodexColors] = useState(true);

  const isClaude = platform === "claude";
  const items = isClaude ? claudeItems : codexItems;
  const presets = isClaude ? claudePresets : codexPresets;
  const selectedIds = isClaude ? claudeSelected : codexSelected;
  const setSelectedIds = isClaude ? setClaudeSelected : setCodexSelected;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const selectedItems = selectedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is StatuslineItem => Boolean(item));
  const availableItems = items.filter((item) => !selectedIds.includes(item.id));
  const activeClaudeItem =
    claudeItems.find((item) => item.id === editingClaudeItem) ?? claudeItems[0];

  const selectPreset = (nextItems: string[]) => {
    setSelectedIds([...nextItems]);
    if (isClaude && nextItems[0]) setEditingClaudeItem(nextItems[0]);
  };

  const addItem = (id: string) => {
    setSelectedIds([...selectedIds, id]);
    if (isClaude) setEditingClaudeItem(id);
  };

  const removeItem = (id: string) => {
    if (isClaude && selectedIds.length === 1) return;
    const next = selectedIds.filter((selectedId) => selectedId !== id);
    setSelectedIds(next);
    if (isClaude && editingClaudeItem === id && next[0]) {
      setEditingClaudeItem(next[0]);
    }
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = selectedIds.indexOf(id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= selectedIds.length) {
      return;
    }
    const next = [...selectedIds];
    [next[index], next[destination]] = [next[destination], next[index]];
    setSelectedIds(next);
  };

  const previewText = (item: StatuslineItem) => {
    if (item.id === "branch" && showGitStatus) return `${item.preview}*`;
    if (item.id !== "five" && item.id !== "seven") return item.preview;

    const prefix = item.id === "five" ? "5h" : "7d";
    const amount = item.id === "five" ? "84%" : "63%";
    if (meterStyle === "percent") return `${prefix} ${amount}`;
    return `${prefix} ${meterStyles[meterStyle].sample} ${amount}`;
  };

  const segments: StatuslineSegment[] = selectedItems.map((item, index) => ({
    id: item.id,
    text: `${isClaude && showIcons && item.icon ? `${item.icon} ` : ""}${previewText(item)}`,
    className: isClaude
      ? claudeColors[claudeItemColors[item.id] ?? "default"].preview
      : codexColors
        ? CODEX_ACCENTS[index % CODEX_ACCENTS.length]
        : "text-zinc-300",
  }));

  return (
    <section
      id="preview"
      aria-labelledby="preview-title"
      className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_28px_90px_-40px_rgba(0,0,0,0.32)] dark:border-gray-800 dark:bg-[#141414] dark:shadow-none">
        <div className="flex min-h-12 items-center justify-between border-b border-gray-200 bg-gray-50/80 px-4 dark:border-gray-800 dark:bg-[#101010] sm:px-5">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            lpm · Settings · AI &amp; Integrations
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <Save className="h-3 w-3" aria-hidden />
            Saved
          </span>
        </div>

        <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Interactive lpm preview
              </p>
              <h2
                id="preview-title"
                className="text-xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-2xl"
              >
                Try the statusline editor before you download.
              </h2>
              <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                Pick a layout, arrange the signals, and tune the appearance just
                as you would inside lpm. In the app, find this editor
                under Settings → AI &amp; Integrations.
              </p>
            </div>
            <div
              role="group"
              data-on-dark
              className="flex rounded-2xl bg-gray-950 p-1.5 dark:bg-black"
              aria-label="Choose an AI coding agent"
            >
              {(
                [
                  ["claude", "Claude Code", "bg-[#D97757]"],
                  ["codex", "Codex", "bg-[#10A37F]"],
                ] as const
              ).map(([id, label, active]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatform(id)}
                  aria-pressed={platform === id}
                  className={`${platformButtonClass} ${
                    platform === id
                      ? `${active} text-white shadow-sm`
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-current"
                    aria-hidden
                  />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.03fr_0.97fr]">
          <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-6 xl:border-r xl:border-b-0">
            <StatuslinePresets
              presets={presets}
              selectedIds={selectedIds}
              isClaude={isClaude}
              onSelect={selectPreset}
            />
            <StatuslineItemList
              items={selectedItems}
              isClaude={isClaude}
              editingId={editingClaudeItem}
              onEdit={setEditingClaudeItem}
              onMove={moveItem}
              onRemove={removeItem}
            />
            <StatuslineAddItems
              items={availableItems}
              isClaude={isClaude}
              onAdd={addItem}
            />
          </div>

          <div className="flex min-w-0 flex-col bg-gray-50/60 p-4 dark:bg-black/10 sm:p-6">
            <StatuslineTerminalPreview
              isClaude={isClaude}
              segments={segments}
              separator={isClaude ? separators[separator].value : "·"}
            />

            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-gray-400" aria-hidden />
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  Appearance
                </h3>
              </div>
              {isClaude ? (
                <StatuslineClaudeAppearance
                  itemLabel={activeClaudeItem.label}
                  color={claudeItemColors[editingClaudeItem]}
                  onColor={(id) =>
                    setClaudeItemColors((current) => ({
                      ...current,
                      [editingClaudeItem]: id,
                    }))
                  }
                  separator={separator}
                  onSeparator={setSeparator}
                  meterStyle={meterStyle}
                  onMeterStyle={setMeterStyle}
                  showIcons={showIcons}
                  onToggleIcons={() => setShowIcons((value) => !value)}
                  showGitStatus={showGitStatus}
                  onToggleGitStatus={() => setShowGitStatus((value) => !value)}
                  gitStatusAvailable={selectedIds.includes("branch")}
                />
              ) : (
                <StatuslineCodexAppearance
                  useColors={codexColors}
                  onToggleColors={() => setCodexColors((value) => !value)}
                />
              )}
            </div>

            <div
              data-on-dark
              className="mt-4 rounded-2xl border border-gray-800 bg-[#0b0b0b] p-5 text-white"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
                <Settings2 className="h-4 w-4" aria-hidden />
                Applied by lpm
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                In the Mac app, changes save to the active agent configuration
                while you work. No script, JSON, or TOML editing required.
              </p>
              <DownloadLink className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-gray-950 transition hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black">
                Download lpm for macOS
                <ArrowRight className="h-4 w-4" aria-hidden />
              </DownloadLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
