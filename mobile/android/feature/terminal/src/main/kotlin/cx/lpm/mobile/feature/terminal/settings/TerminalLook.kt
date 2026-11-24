package cx.lpm.mobile.feature.terminal.settings

import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.TerminalViewMode
import cx.lpm.mobile.core.web.TerminalPrefs
import cx.lpm.mobile.core.web.TerminalTheme
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/** The phone-local terminal preferences (Settings → Terminal), on every terminal. */
data class TerminalLook(
    val fontSize: Int = TerminalPrefs.DEFAULT_FONT_SIZE,
    val theme: TerminalTheme = TerminalPrefs.DefaultTheme
)

internal val AppPreferences.terminalLook: TerminalLook
    get() = TerminalLook(
        fontSize = (int(PreferenceKeys.TERMINAL_FONT_SIZE) ?: TerminalPrefs.DEFAULT_FONT_SIZE)
            .coerceIn(TerminalPrefs.MIN_FONT_SIZE, TerminalPrefs.MAX_FONT_SIZE),
        theme = TerminalPrefs.theme(string(PreferenceKeys.TERMINAL_THEME))
    )

internal fun AppPreferences.terminalLooks(): Flow<TerminalLook> =
    data.map { terminalLook }.distinctUntilChanged()

/** What agent tabs show, terminal or conversation (the "…" menu's View). */
internal val AppPreferences.terminalViewMode: TerminalViewMode
    get() = TerminalViewMode.of(string(PreferenceKeys.TERMINAL_VIEW))

internal fun AppPreferences.terminalViewModes(): Flow<TerminalViewMode> =
    data.map { terminalViewMode }.distinctUntilChanged()

internal fun AppPreferences.setTerminalViewMode(mode: TerminalViewMode) =
    setString(PreferenceKeys.TERMINAL_VIEW, mode.id)

internal fun AppPreferences.setTerminalFontSize(size: Int) = setInt(
    PreferenceKeys.TERMINAL_FONT_SIZE,
    size.coerceIn(TerminalPrefs.MIN_FONT_SIZE, TerminalPrefs.MAX_FONT_SIZE)
)

internal fun AppPreferences.setTerminalTheme(theme: TerminalTheme) =
    setString(PreferenceKeys.TERMINAL_THEME, theme.id)
