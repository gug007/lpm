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
import { terminalThemeOf } from "../../hooks/useTerminalTheme";
import { rowProps } from "../../settings-registry";
import type { TerminalThemeName } from "../../terminal-themes";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { TerminalFontSelect } from "../TerminalFontSelect";
import { TerminalThemeSelect } from "../TerminalThemeSelect";
import { Toggle } from "../ui/Toggle";
import { useSettingsTarget } from "./settingsTarget";
import { StepperControl } from "./StepperControl";
import { TerminalThemePreview } from "./TerminalThemePreview";
import { useMachineList } from "./useMachineList";

export function TerminalPane() {
  const { settings, update, commands } = useSettingsTarget();
  const fontSize = terminalFontSizeOf(settings.terminalFontSize);
  const font = terminalFontOf(settings);
  const theme = terminalThemeOf(settings.terminalTheme);
  const [themePreview, setThemePreview] = useState<TerminalThemeName | null>(null);

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
    <SettingsSection>
      <div className="p-3">
        <TerminalThemePreview
          theme={themePreview ?? theme}
          fontSize={fontSize}
          fontFamily={font.fontFamily}
          lineHeight={font.lineHeight}
        />
      </div>
      <SettingsRow {...rowProps("terminal.fontFamily")}>
        <TerminalFontSelect
          value={font.family}
          options={fontOptions}
          onChange={(family) => void update({ terminalFontFamily: family })}
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
      <SettingsRow {...rowProps("terminal.theme")}>
        <TerminalThemeSelect
          value={theme}
          onChange={(next) => void update({ terminalTheme: next })}
          onHighlightChange={setThemePreview}
        />
      </SettingsRow>
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
      <SettingsRow {...rowProps("terminal.appTips")}>
        <Toggle
          enabled={!(settings.appTipsDismissed ?? false)}
          onChange={(v) => void update({ appTipsDismissed: !v })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
