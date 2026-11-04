package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.dictation.plusDictated
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * One terminal's composer: the prompt tabs (text + attachments) plus the in-flight
 * AI rewrite. Held by [ComposerSessions] keyed by terminal id, so it survives
 * leaving and re-entering the terminal — the desktop's session-scoped drafts.
 * Uploads live in ComposerUploads.kt, files in ComposerFiles.kt and the rewrite in
 * ComposerTransform.kt. Everything runs on the main thread; blocking media work
 * goes to [io].
 */
class ComposerStore internal constructor(
    val termId: String,
    val project: String,
    val label: String,
    internal val link: ComposerLink,
    internal val media: ComposerMedia,
    parent: CoroutineScope,
    internal val io: CoroutineDispatcher,
    private val now: () -> Long
) {
    private val mutable = MutableStateFlow(ComposerState())
    val state: StateFlow<ComposerState> = mutable.asStateFlow()

    internal val scope =
        CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext[Job]))

    // Upload payloads kept for a retry without re-picking, keyed by attachment id;
    // dropped on success.
    internal val uploadPayloads = mutableMapOf<String, UploadPayload>()

    // Attachment ids awaiting an upload reply, in send order — only a FIFO fallback
    // for an old server that doesn't echo `reqId`.
    internal val pendingOrder = mutableListOf<String>()

    // Scratch copies of picked files and videos, kept until they reach the Mac so a
    // failed upload can be retried, and the piece-by-piece uploads in flight.
    internal val fileSources = mutableMapOf<String, File>()
    internal val fileUploads = mutableMapOf<String, ChunkedUpload>()

    internal val rewrite = RewriteRun()

    // Two-way draft sync with the Mac (and any other paired phone): the active tab's
    // text goes out debounced; a draft coming in applies unless the person is typing
    // here. `lastAppliedDraftRev` drops stale frames.
    private var draftSend: Job? = null
    private var lastLocalEditAt = Long.MIN_VALUE / 2
    private var lastAppliedDraftRev = 0

    /** Set from the field's focus so a draft coming in yields to someone typing here. */
    var isEditorFocused = false

    val current: ComposerState get() = mutable.value

    internal fun update(change: (ComposerState) -> ComposerState) = mutable.update(change)

    // MARK: the active tab

    /** The person typed: the active tab's new text, mirrored to the Mac shortly. */
    fun setText(text: String) {
        writeActive(text)
        noteLocalEdit(text)
    }

    /**
     * Add text at the end of the active tab, with a separating space when the field
     * doesn't already end in whitespace.
     */
    fun appendText(text: String, spaced: Boolean = true) {
        val existing = current.tabs.getOrNull(current.activeIndex)?.text ?: return
        var next = existing
        if (spaced && next.isNotEmpty() && !next.endsWith(" ") && !next.endsWith("\n")) next += " "
        writeActive(next + text)
    }

    /**
     * Words from a take go to the prompt it started on, or the one on screen if that
     * prompt has closed, so they're never lost.
     */
    fun appendDictated(words: String, tabId: String) {
        val state = current
        val index =
            state.tabs.indexOfFirst { it.id == tabId }.takeIf { it >= 0 } ?: state.activeIndex
        val text = state.tabs.getOrNull(index)?.text?.plusDictated(words) ?: return
        update { s -> s.copy(tabs = s.tabs.replaced(index) { it.copy(text = text) }) }
        if (index == current.activeIndex) noteLocalEdit(text)
    }

    private fun writeActive(text: String) = update { s ->
        if (s.activeIndex !in s.tabs.indices) return@update s
        s.copy(tabs = s.tabs.replaced(s.activeIndex) { it.copy(text = text) })
    }

    // MARK: tabs

    fun newTab() = update { it.copy(tabs = it.tabs + ComposerTab(), activeIndex = it.tabs.size) }

    fun switchTab(index: Int) = update { s ->
        if (index in s.tabs.indices) s.copy(activeIndex = index) else s
    }

    fun closeTab(index: Int) {
        update { s ->
            if (s.tabs.size <= 1 || index !in s.tabs.indices) return@update s
            val tabs = s.tabs.filterIndexed { i, _ -> i != index }
            val active = when {
                s.activeIndex >= tabs.size -> tabs.size - 1
                index < s.activeIndex -> s.activeIndex - 1
                else -> s.activeIndex
            }
            s.copy(tabs = tabs, activeIndex = active)
        }
        pruneFileSources()
    }

    /**
     * Take over the prompts typed for another terminal, the tab lpm reopened in this
     * one's place, unless something is typed here already. Attachments still
     * uploading went with the old tab's link.
     */
    fun adoptDraft(other: ComposerStore) {
        if (current.tabs.any { it.text.isNotEmpty() || it.attachments.isNotEmpty() }) return
        val tabs = other.current.tabs.map { old ->
            ComposerTab(
                text = old.text,
                attachments = old.attachments.filter {
                    it.macPath != null
                }
            )
        }
        update {
            it.copy(tabs = tabs, activeIndex = minOf(other.current.activeIndex, tabs.lastIndex))
        }
        if (current.text.isNotEmpty()) link.sendDraft(termId, current.text)
    }

    /**
     * After a successful send: close the sent tab if others remain, else clear it in
     * place (the desktop's "a sent prompt closes its tab, else resets").
     */
    fun afterSend() {
        if (current.tabs.size > 1) {
            closeTab(current.activeIndex)
        } else {
            update { it.copy(tabs = listOf(ComposerTab()), activeIndex = 0) }
            pruneFileSources()
        }
        // The active input changed; push it now rather than after the debounce.
        draftSend?.cancel()
        draftSend = null
        link.sendDraft(termId, current.text)
    }

    // MARK: draft sync

    private fun noteLocalEdit(text: String) {
        lastLocalEditAt = now()
        draftSend?.cancel()
        draftSend = scope.launch {
            delay(DRAFT_DEBOUNCE_MS)
            draftSend = null
            link.sendDraft(termId, text)
        }
    }

    /**
     * Apply a draft mirrored from the Mac. Drops a stale frame or this phone's own
     * echo, yields to someone focused and typing here, and a draft carried by a
     * `seed` only fills an empty input, so a reconnect never clobbers a prompt in
     * progress.
     */
    fun applyRemoteDraft(text: String, rev: Int, origin: String, isSeed: Boolean) {
        if (rev <= lastAppliedDraftRev) return
        lastAppliedDraftRev = rev
        val mine = link.selfDeviceId
        if (!mine.isNullOrEmpty() && origin == mine) return
        if (isEditorFocused && now() - lastLocalEditAt < TYPING_GRACE_MS) return
        if (isSeed && current.tabs.getOrNull(current.activeIndex)?.text?.isEmpty() != true) return
        draftSend?.cancel()
        draftSend = null
        setText(text, current.activeTab.id)
    }

    /** Write text to a tab by id; dropped if the tab is gone. */
    internal fun setText(text: String, tabId: String?) = update { s ->
        val index = s.tabs.indexOfFirst { it.id == tabId }
        if (index < 0) s else s.copy(tabs = s.tabs.replaced(index) { it.copy(text = text) })
    }

    /** The terminal went away or the session ended: stop timers and uploads, drop copies. */
    fun dispose() {
        fileUploads.values.forEach { it.cancel() }
        fileUploads.clear()
        fileSources.values.forEach(media::discard)
        fileSources.clear()
        scope.cancel()
    }

    internal class UploadPayload(val b64: String, val mime: String, val name: String?)

    internal companion object {
        const val DRAFT_DEBOUNCE_MS = 250L
        const val TYPING_GRACE_MS = 1_500L
    }
}

internal inline fun <T> List<T>.replaced(index: Int, change: (T) -> T): List<T> =
    mapIndexed { i, item -> if (i == index) change(item) else item }
