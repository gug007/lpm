import { useMemo, useState } from "react";
import {
  MAX_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_LINE_HEIGHT,
  steppedTerminalLineHeight,
  terminalFontOf,
} from "../../hooks/useTerminalFont";
import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  steppedTerminalFontSize,
  terminalFontSizeOf,
} from "../../hooks/useTerminalFontSize";
import { rowProps } from "../../settings-registry";
import type { TerminalThemeName } from "../../terminal-themes";
import {
  resolveTerminalTheme,
  terminalThemeChoiceOf,
  themeModePatch,
  themePickPatch,
} from "../../terminalThemeChoice";
import { useAppearanceOf } from "../../theme";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { TerminalFontSelect } from "../TerminalFontSelect";
import { terminalFontStack } from "../terminal-utils";
import { Toggle } from "../ui/Toggle";
import { useSettingsTarget } from "./settingsTarget";
import { StepperControl } from "./StepperControl";
import { TerminalThemeGrid } from "./TerminalThemeGrid";
import { TerminalThemeModeControl } from "./TerminalThemeModeControl";
import { TerminalThemePreview } from "./TerminalThemePreview";
import { useMachineList } from "./useMachineList";

export function TerminalPane() {
  const { settings, update, commands } = useSettingsTarget();
  const fontSize = terminalFontSizeOf(settings.terminalFontSize);
  const font = terminalFontOf(settings);
  const showing = useAppearanceOf(settings.theme);
  const themeChoice = terminalThemeChoiceOf(settings);
  const theme = resolveTerminalTheme(themeChoice, showing);
  const [themePreview, setThemePreview] = useState<TerminalThemeName | null>(null);
  const [fontPreview, setFontPreview] = useState<string | undefined | null>(null);

  const fonts = useMachineList(commands.listMonospaceFonts);
  const fontOptions = useMemo(
    () => (font.family && !fonts.includes(font.family) ? [font.family, ...fonts] : fonts),
    [fonts, font.family],
  );

  const stepFontSize = (delta: number) => {
    const next = steppedTerminalFontSize(fontSize, delta);
    if (next !== fontSize) void update({ terminalFontSize: next });
  };
  const stepLineHeight = (delta: number) => {
    const next = steppedTerminalLineHeight(font.lineHeight, delta);
    if (next !== font.lineHeight) void update({ terminalLineHeight: next });
  };

  return (
    <>
      <SettingsSection title="Appearance">
        <div className="p-3">
          <TerminalThemePreview
            theme={themePreview ?? theme}
            fontSize={fontSize}
            fontFamily={fontPreview === null ? font.fontFamily : terminalFontStack(fontPreview)}
            lineHeight={font.lineHeight}
          />
        </div>
        <SettingsRow {...rowProps("terminal.fontFamily")}>
          <TerminalFontSelect
            value={font.family}
            options={fontOptions}
            onChange={(family) => void update({ terminalFontFamily: family })}
            onHighlightChange={setFontPreview}
          />
        </SettingsRow>
        <SettingsRow {...rowProps("terminal.fontSize")}>
          <StepperControl
            value={String(fontSize)}
            label="terminal font size"
            canDecrease={fontSize > MIN_TERMINAL_FONT_SIZE}
            canIncrease={fontSize < MAX_TERMINAL_FONT_SIZE}
            onDecrease={() => stepFontSize(-1)}
            onIncrease={() => stepFontSize(1)}
          />
        </SettingsRow>
        <SettingsRow {...rowProps("terminal.lineHeight")}>
          <StepperControl
            value={font.lineHeight.toFixed(1)}
            label="terminal line height"
            canDecrease={font.lineHeight > MIN_TERMINAL_LINE_HEIGHT}
            canIncrease={font.lineHeight < MAX_TERMINAL_LINE_HEIGHT}
            onDecrease={() => stepLineHeight(-0.1)}
            onIncrease={() => stepLineHeight(0.1)}
          />
        </SettingsRow>
        <SettingsRow
          {...rowProps("terminal.theme", {
            description:
              themeChoice.mode === "follow"
                ? "Choose a dark theme and a light one; terminals switch with the app"
                : undefined,
          })}
          footer={
            <TerminalThemeGrid
              choice={themeChoice}
              onPick={(name) => void update(themePickPatch(themeChoice, name, showing))}
              onPreview={setThemePreview}
            />
          }
        >
          <TerminalThemeModeControl
            mode={themeChoice.mode}
            onChange={(mode) => void update(themeModePatch(themeChoice, mode, showing))}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Files">
        <SettingsRow {...rowProps("terminal.openInDefaultApp")}>
          <Toggle
            enabled={settings.terminalOpenInDefaultApp ?? false}
            onChange={(v) => void update({ terminalOpenInDefaultApp: v })}
          />
        </SettingsRow>
        <SettingsRow {...rowProps("terminal.filesTreeSide")}>
          <SettingsSelect
            value={settings.filesTreeSide ?? "right"}
            onChange={(e) =>
              void update({ filesTreeSide: e.target.value === "left" ? "left" : "right" })
            }
            aria-label="Files tree position"
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </SettingsSelect>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Footer">
        <SettingsRow {...rowProps("terminal.appTips")}>
          <Toggle
            enabled={!(settings.appTipsDismissed ?? false)}
            onChange={(v) => void update({ appTipsDismissed: !v })}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
