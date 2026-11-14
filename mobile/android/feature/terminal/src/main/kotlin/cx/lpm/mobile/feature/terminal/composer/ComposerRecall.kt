package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.terminals.TerminalsState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What History puts in the field: a picked prompt goes after what's typed, not over
 * it, and the toast offers the draft back.
 */
internal class HistoryPicks(private val field: CommandField) {
    private val mutable = MutableStateFlow<ComposerRestore?>(null)

    /** The draft before the last pick went after it, while the toast offers it back. */
    val restore: StateFlow<ComposerRestore?> = mutable.asStateFlow()

    /** True when [picked] went after a draft in tab [tab], which the toast now offers back. */
    fun pick(picked: String, tab: String?): Boolean {
        val before = field.text
        if (before.isBlank()) {
            field.replace(picked)
            return false
        }
        field.replace(before + (if (before.endsWith("\n")) "\n" else "\n\n") + picked)
        if (tab == null) return false
        mutable.value = ComposerRestore(tab, before)
        return true
    }

    fun dismiss() {
        mutable.value = null
    }
}

/**
 * The prompt last sent in a tab, offered back while its field is empty: one this phone
 * sent, else the newest the Mac's history has for the tab.
 */
internal fun TerminalsState?.lastPrompt(project: String, label: String, lastSent: String?) =
    (lastSent ?: this?.history?.get(project)?.firstOrNull { it.terminalLabel == label }?.text)
        ?.takeIf { it.isNotBlank() }
