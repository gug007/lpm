"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Monitor,
  Palette,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Terminal,
  X,
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

const platformButtonClass =
  "flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

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

function itemMap(items: StatuslineItem[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function sameItems(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

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
  const itemsById = itemMap(items);
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
            LPM Desktop · Settings · AI &amp; Integrations
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <Save className="h-3 w-3" aria-hidden />
            Saved
          </span>
        </div>

        <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Interactive LPM preview
              </p>
              <h2
                id="preview-title"
                className="text-xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-2xl"
              >
                Try the statusline editor before you download.
              </h2>
              <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                Pick a layout, arrange the signals, and tune the appearance just
                as you would inside LPM Desktop. In the app, find this editor
                under Settings → AI &amp; Integrations.
              </p>
            </div>
            <div
              className="flex rounded-2xl bg-gray-950 p-1.5 dark:bg-black"
              aria-label="Choose an AI coding agent"
            >
              <button
                type="button"
                onClick={() => setPlatform("claude")}
                aria-pressed={isClaude}
                className={`${platformButtonClass} ${
                  isClaude
                    ? "bg-[#D97757] text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full bg-current"
                  aria-hidden
                />
                Claude Code
              </button>
              <button
                type="button"
                onClick={() => setPlatform("codex")}
                aria-pressed={!isClaude}
                className={`${platformButtonClass} ${
                  !isClaude
                    ? "bg-[#10A37F] text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full bg-current"
                  aria-hidden
                />
                Codex
              </button>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[1.03fr_0.97fr]">
          <div className="border-b border-gray-200 p-4 dark:border-gray-800 sm:p-6 xl:border-r xl:border-b-0">
            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  Choose a starting point
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Every layout stays customizable.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {presets.map((preset) => {
                  const isActive = sameItems(preset.items, selectedIds);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectPreset(preset.items)}
                      aria-pressed={isActive}
                      className={`rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                        isActive
                          ? isClaude
                            ? "border-[#D97757]/60 bg-[#D97757]/8"
                            : "border-[#10A37F]/60 bg-[#10A37F]/8"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {preset.label}
                        </span>
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            isActive
                              ? isClaude
                                ? "border-[#D97757] bg-[#D97757] text-white"
                                : "border-[#10A37F] bg-[#10A37F] text-white"
                              : "border-gray-300 text-transparent dark:border-gray-700"
                          }`}
                          aria-hidden
                        >
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                    Arrange your items
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Move, edit, or remove each signal.
                  </p>
                </div>
                <span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                  {selectedIds.length}{" "}
                  {selectedIds.length === 1 ? "item" : "items"}
                </span>
              </div>
              {selectedItems.length === 0 ? (
                <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 dark:border-gray-700 dark:bg-black/20 dark:text-gray-400">
                  Statusline hidden. Add an item below to turn it back on.
                </div>
              ) : (
                <ol className="space-y-2">
                  {selectedItems.map((item, index) => {
                    const isEditing =
                      isClaude && editingClaudeItem === item.id;
                    return (
                      <li
                        key={item.id}
                        className={`flex min-h-12 items-center gap-2 rounded-xl border px-2.5 transition-colors ${
                          isEditing
                            ? "border-[#D97757]/50 bg-[#D97757]/7 dark:bg-[#D97757]/10"
                            : "border-gray-200 bg-gray-50/70 dark:border-gray-700/60 dark:bg-white/[0.04]"
                        }`}
                      >
                        <span className="w-5 text-center font-mono text-[11px] text-gray-400 dark:text-gray-500">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            isClaude && setEditingClaudeItem(item.id)
                          }
                          className={`min-w-0 flex-1 truncate rounded-md py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                            isEditing
                              ? "text-[#B75F40] dark:text-[#F09978]"
                              : "text-gray-800 dark:text-gray-200"
                          } ${isClaude ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {item.label}
                          {isEditing && (
                            <span className="ml-2 inline-flex -translate-y-px items-center rounded-full bg-[#D97757]/12 px-2 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-[0.08em] dark:bg-[#D97757]/18">
                              Editing
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${item.label} left`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, 1)}
                          disabled={index === selectedItems.length - 1}
                          aria-label={`Move ${item.label} right`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={isClaude && selectedItems.length === 1}
                          aria-label={`Remove ${item.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="mt-7">
              <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                Add an item
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {isClaude
                  ? "Add project, model, usage, cost, or your own text."
                  : "Codex hides fields automatically when no value is available."}
              </p>
              {availableItems.length > 0 ? (
                <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {availableItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItem(item.id)}
                      className="group flex min-h-14 items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-left transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.03] dark:focus-visible:ring-white"
                    >
                      <Plus
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isClaude ? "text-[#D97757]" : "text-[#10A37F]"
                        }`}
                        aria-hidden
                      />
                      <span>
                        <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Every supported item is already in your statusline.
                </p>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col bg-gray-50/60 p-4 dark:bg-black/10 sm:p-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  Live terminal preview
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/8 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Applied
                </span>
              </div>
              <div
                className={`overflow-hidden rounded-2xl border border-white/10 bg-[#080808] transition-shadow duration-500 ${
                  isClaude
                    ? "shadow-[0_24px_60px_-28px_rgba(217,119,87,0.55)]"
                    : "shadow-[0_24px_60px_-28px_rgba(16,163,127,0.55)]"
                }`}
              >
                <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
                  <div className="flex gap-1.5" aria-hidden>
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="font-mono text-[10px] tracking-wide text-zinc-600">
                    ~/Projects/lpm
                  </span>
                  <Terminal className="h-3.5 w-3.5 text-zinc-700" aria-hidden />
                </div>
                <div className="flex min-h-52 flex-col justify-between p-4 font-mono text-xs sm:min-h-60 sm:p-5">
                  <div className="space-y-2 text-zinc-500">
                    <p>
                      <span className="text-emerald-400">❯</span>{" "}
                      {isClaude ? "claude" : "codex"}
                    </p>
                    <p className="text-zinc-300">
                      {isClaude
                        ? "Ready to help with your project."
                        : "What would you like to build?"}
                    </p>
                    <p className="pt-4 text-zinc-700">
                      <span className="animate-pulse">▋</span>
                    </p>
                  </div>
                  <div
                    className="relative mt-8 border-t border-white/8 pt-3"
                    aria-live="polite"
                    aria-label={`${isClaude ? "Claude Code" : "Codex"} statusline preview`}
                  >
                    {selectedItems.length === 0 ? (
                      <span className="text-zinc-600">Statusline hidden</span>
                    ) : (
                      <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className="flex min-w-max items-center whitespace-nowrap pr-6">
                        {selectedItems.map((item, index) => (
                          <span key={item.id} className="flex items-center">
                            {index > 0 && (
                              <span className="px-2 text-zinc-700">
                                {isClaude ? separators[separator].value : "·"}
                              </span>
                            )}
                            <span
                              className={
                                isClaude
                                  ? claudeColors[
                                      claudeItemColors[item.id] ?? "default"
                                    ].preview
                                  : codexColors
                                    ? index % 3 === 0
                                      ? "text-emerald-300"
                                      : index % 3 === 1
                                        ? "text-cyan-300"
                                        : "text-zinc-400"
                                    : "text-zinc-300"
                              }
                            >
                              {isClaude && showIcons && item.icon
                                ? `${item.icon} `
                                : ""}
                              {previewText(item)}
                            </span>
                          </span>
                        ))}
                        </div>
                        <div
                          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#080808] to-transparent"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171717]">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-gray-400" aria-hidden />
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  Appearance
                </h3>
              </div>

              {isClaude ? (
                <div className="mt-4 space-y-5">
                  <fieldset>
                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Color for {activeClaudeItem.label}
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        Object.entries(claudeColors) as [
                          ClaudeColorId,
                          (typeof claudeColors)[ClaudeColorId],
                        ][]
                      ).map(([id, color]) => {
                        const isActive =
                          claudeItemColors[editingClaudeItem] === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() =>
                              setClaudeItemColors((current) => ({
                                ...current,
                                [editingClaudeItem]: id,
                              }))
                            }
                            aria-pressed={isActive}
                            aria-label={`${color.label} for ${activeClaudeItem.label}`}
                            title={color.label}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                              isActive
                                ? `border-transparent ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#171717] ${color.ring}`
                                : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                            }`}
                          >
                            <span
                              className={`h-3 w-3 rounded-full ${color.swatch}`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Separator
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        Object.entries(separators) as [
                          SeparatorId,
                          (typeof separators)[SeparatorId],
                        ][]
                      ).map(([id, option]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSeparator(id)}
                          aria-pressed={separator === id}
                          aria-label={`Use ${option.label}`}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                            separator === id
                              ? "border-[#D97757] bg-[#D97757]/8 text-[#B75F40] dark:text-[#F09978]"
                              : "border-gray-200 text-gray-500 hover:border-gray-400 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-600"
                          }`}
                        >
                          {option.value}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Usage display
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(
                        Object.entries(meterStyles) as [
                          MeterStyleId,
                          (typeof meterStyles)[MeterStyleId],
                        ][]
                      ).map(([id, style]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMeterStyle(id)}
                          aria-pressed={meterStyle === id}
                          className={`min-h-10 rounded-lg border px-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white ${
                            meterStyle === id
                              ? "border-[#D97757] bg-[#D97757]/8"
                              : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                          }`}
                        >
                          <span className="block truncate text-[10px] font-medium text-gray-700 dark:text-gray-300">
                            {style.label}
                          </span>
                          <span
                            className={`block truncate font-mono text-[10px] ${
                              meterStyle === id
                                ? "text-[#B75F40] dark:text-[#F09978]"
                                : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            {style.sample}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setShowIcons((value) => !value)}
                      aria-pressed={showIcons}
                      className="flex min-h-11 items-center justify-between rounded-xl border border-gray-200 px-3 text-left dark:border-gray-800"
                    >
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Show icons
                      </span>
                      <span
                        className={`relative h-5 w-9 rounded-full transition-colors ${
                          showIcons
                            ? "bg-[#D97757]"
                            : "bg-gray-300 dark:bg-gray-700"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                            showIcons ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGitStatus((value) => !value)}
                      aria-pressed={showGitStatus}
                      disabled={!selectedIds.includes("branch")}
                      className="flex min-h-11 items-center justify-between rounded-xl border border-gray-200 px-3 text-left disabled:opacity-40 dark:border-gray-800"
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <GitBranch className="h-3.5 w-3.5" aria-hidden />
                        Git status
                      </span>
                      <span
                        className={`relative h-5 w-9 rounded-full transition-colors ${
                          showGitStatus
                            ? "bg-[#D97757]"
                            : "bg-gray-300 dark:bg-gray-700"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                            showGitStatus ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setCodexColors((value) => !value)}
                    aria-pressed={codexColors}
                    className="flex min-h-14 w-full items-center justify-between rounded-xl border border-gray-200 px-3 text-left transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                        Use active Codex theme colors
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                        LPM preserves the colors selected with{" "}
                        <code className="font-mono">/theme</code>.
                      </span>
                    </span>
                    <span
                      className={`relative ml-3 h-6 w-11 shrink-0 rounded-full transition-colors ${
                        codexColors
                          ? "bg-[#10A37F]"
                          : "bg-gray-300 dark:bg-gray-700"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                          codexColors ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </span>
                  </button>
                  <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    Codex controls separators and rendering. LPM gives you every
                    supported field, ordering, presets, colors, and an Off
                    state without opening config.toml.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-gray-800 bg-[#0b0b0b] p-5 text-white">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
                <Settings2 className="h-4 w-4" aria-hidden />
                Applied by LPM Desktop
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">
                In the Mac app, changes save to the active agent configuration
                while you work. No script, JSON, or TOML editing required.
              </p>
              <Link
                href="/#download"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-gray-950 transition hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Download LPM for macOS
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
