package cx.lpm.mobile.core.web

import android.content.ClipData
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.Clipboard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** What the terminal's hold-to-select bar asked for: select.js posts `selection` with `{ action, text }`. */
internal sealed interface TerminalSelection {
    /** A hold selected a line. */
    data object Began : TerminalSelection

    data class Copy(val text: String) : TerminalSelection

    /** The lines, for the composer as a fenced block. */
    data class Prompt(val text: String) : TerminalSelection

    /** The first line with text, to find in the terminal. */
    data class Find(val text: String) : TerminalSelection

    companion object {
        fun from(message: PageMessage): TerminalSelection? {
            val text = message.string("text")
            return when (message.string("action")) {
                "began" -> Began
                "copy" -> text?.let(::Copy)
                "prompt" -> text?.let(::Prompt)
                "find" -> text?.let(::Find)
                else -> null
            }
        }
    }
}

/** Copy and the haptics happen here, as iOS's terminal view does them; the rest goes to the screen. */
internal class SelectionHandler(
    private val haptics: HapticFeedback,
    private val clipboard: Clipboard,
    private val scope: CoroutineScope,
    private val onAddToPrompt: ((String) -> Unit)?,
    private val onFind: (String) -> Unit
) {
    fun handle(selection: TerminalSelection) {
        when (selection) {
            TerminalSelection.Began -> haptics.performHapticFeedback(
                HapticFeedbackType.ContextClick
            )

            is TerminalSelection.Copy -> {
                val clip = ClipEntry(ClipData.newPlainText(null, selection.text))
                scope.launch { clipboard.setClipEntry(clip) }
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            }

            is TerminalSelection.Prompt -> onAddToPrompt?.invoke(selection.text)

            is TerminalSelection.Find -> onFind(selection.text)
        }
    }
}
