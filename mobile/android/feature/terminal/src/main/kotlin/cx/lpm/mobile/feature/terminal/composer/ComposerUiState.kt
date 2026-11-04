package cx.lpm.mobile.feature.terminal.composer

import androidx.annotation.StringRes
import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationState
import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.SlashCommand

/**
 * What a composer writes to: a terminal, or — without [terminalTools] — a reply
 * box with its own destination (an automation run's follow-up), keyed by
 * [termId] all the same.
 */
data class ComposerTarget(
    val termId: String,
    val project: String,
    val label: String,
    val session: SessionKey,
    val terminalTools: Boolean = true
)

data class ComposerUiState(
    val composer: ComposerState = ComposerState(),
    /** The terminal's own tools: special keys, slash commands, its output as context, memory, duplicates. */
    val terminalTools: Boolean = true,
    val slashMatches: List<SlashCommand> = emptyList(),
    val slashArgumentHint: String? = null,
    /** The heading over the agent's own commands in the `/` menu; null for the generic one. */
    val agentLabel: String? = null,
    /**
     * The user's lpm commands run here (an agent terminal on a Mac that keeps them): the
     * `/` menu ends with "Manage commands" and "+" offers "Save as command".
     */
    val lpmCommands: Boolean = false,
    val commandNotice: CommandNotice? = null,
    /** An "@fragment" is being typed, so the mention menu shows (its Context rows at least). */
    val mentionActive: Boolean = false,
    val mentions: MentionResults = MentionResults(),
    /** Session memory lives on the Mac running the agent, so an SSH project has none here. */
    val memoryAvailable: Boolean = false,
    /** The AI CLI the terminal runs, deciding how a memory invocation is written. */
    val terminalCli: String = "",
    val composerActions: List<ComposerAction> = emptyList(),
    val variantCounts: Map<String, Int> = emptyMap(),
    /** What the composer's toast says about a send or a saved draft. */
    @param:StringRes val sendWarning: Int? = null,
    /** The app's recorder, and this composer's name for it. */
    val dictation: DictationState = DictationState(),
    val dictationOwner: String = ""
) {
    val hasText: Boolean get() = composer.text.isNotBlank()

    val takeActive: Boolean get() = dictation.isActive(dictationOwner)
    val takeFailure: DictationFailure? get() = dictation.failure(dictationOwner)

    /** The recorder or its notice is showing in this composer. */
    val stripShown: Boolean get() = takeActive || takeFailure != null

    /**
     * With nothing to send, the mic is the composer's main button, as on desktop.
     * Keyed off an empty draft, not a disabled Send: Send is also disabled during an
     * upload, when it has to stay.
     */
    fun micInSendSeat(enabled: Boolean): Boolean =
        enabled && composer.sendState == SendState.Empty && !composer.transforming

    fun micBesideSend(enabled: Boolean): Boolean =
        enabled && !stripShown && !micInSendSeat(enabled = true)

    val canSend: Boolean
        get() = when (composer.sendState) {
            is SendState.Ready, is SendState.DroppedFailures -> !composer.transforming
            SendState.Pending, SendState.Empty -> false
        }

    /** Save as draft and the duplicates run are worth offering only with text to act on. */
    val sendMenuUseful: Boolean get() = hasText && !composer.transforming

    val canRewrite: Boolean get() = hasText && !composer.transforming

    /** A terminal always offers its own output; a reply box only shows actual matches. */
    val showsMentionMenu: Boolean get() = mentionActive && (terminalTools || !mentions.isEmpty)

    fun variants(key: String): Int = variantCounts[key] ?: 1
}

/** The tab strip's summary of each tab; the active tab's preview stays blank while it's typed into. */
data class TabStripItem(val id: String, val preview: String, val attachmentCount: Int)

internal val ComposerState.tabStripItems: List<TabStripItem>
    get() = tabs.mapIndexed { index, tab ->
        TabStripItem(
            id = tab.id,
            preview = if (index == activeIndex) "" else tab.preview,
            attachmentCount = tab.attachments.size
        )
    }
