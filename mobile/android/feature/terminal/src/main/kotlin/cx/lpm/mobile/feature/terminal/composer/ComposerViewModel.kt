package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.services.ServiceLogsState
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.MentionPlace
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.feature.terminal.R
import cx.lpm.mobile.feature.terminal.history.HistoryStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The terminal composer: what's typed (held here as the field's state, mirrored
 * into the terminal's [ComposerStore]), the autocomplete menus and sending.
 * Send goes through the terminal's web view, which wraps the body as a bracketed
 * paste (as the desktop does) so a multi-line prompt reaches an agent whole.
 */
@HiltViewModel(assistedFactory = ComposerViewModel.Factory::class)
class ComposerViewModel @AssistedInject constructor(
    @Assisted private val target: ComposerTarget,
    sessions: MacSessions,
    private val dictation: DictationStore
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(target: ComposerTarget): ComposerViewModel
    }

    private val session: MacSession? = sessions[target.session]
    private val terminals = session?.store<TerminalsStore>()
    private val projects = session?.store<ProjectsStore>()
    private val composers = session?.store<ComposerSessions>()
    private val history = session?.store<HistoryStore>()
    private val serviceLogs = session?.store<ServiceLogsStore>()
    private val git = session?.store<GitStore>()

    // A "<service> logs" mention waiting for its reply, injected when it lands.
    private var pendingLog: PendingLog? = null

    // The terminal's composer; null once its session (a machine visit) has ended.
    private val store: ComposerStore? = composers?.store(
        target.termId,
        target.project,
        target.label
    )

    /** The message field. */
    val input = TextFieldState(store?.current?.text.orEmpty())

    // The text the field and the store last agreed on, so neither echoes the other.
    private var synced = input.text.toString()

    private val warning = MutableStateFlow<Int?>(null)

    private val dictationOwner = "composer:${target.termId}"

    private val lpmCommands = ComposerLpmCommands(
        session?.store<LpmCommandsStore>(),
        target.project,
        viewModelScope,
        reloadMenu = { terminals?.loadSlash(target.termId, target.project) },
        field = object : CommandField {
            override val text: String get() = currentText

            override fun replace(text: String) = replaceText(text)

            override fun send() {
                sendComposed(onSend = null)
            }
        }
    )

    // The terminals and the project's git branches, the @-mention menu's sources.
    private val mentionSources = combine(
        terminals?.state ?: flowOf(null),
        git?.state?.map { it.branches[target.project].orEmpty() }?.distinctUntilChanged()
            ?: flowOf(emptyList())
    ) { terms, branches -> terms to branches }

    val uiState: StateFlow<ComposerUiState> = combine(
        store?.state ?: flowOf(ComposerState()),
        mentionSources,
        projects?.state ?: flowOf(null),
        composers?.composerActions ?: flowOf(emptyList()),
        composers?.variantCounts ?: flowOf(emptyMap())
    ) { composer, (terms, branches), projectsState, actions, counts ->
        val tools = target.terminalTools
        val commands = if (tools) {
            terms?.slashCommands?.get(
                target.termId
            ).orEmpty()
        } else {
            emptyList()
        }
        val mention = mentionQuery(composer.text)
        val cli = terms.cli()
        ComposerUiState(
            composer = composer,
            terminalTools = tools,
            slashMatches = if (tools) slashMatches(composer.text, commands) else emptyList(),
            slashArgumentHint = if (tools) slashArgumentHint(composer.text, commands) else null,
            lpmCommands = lpmCommands.runHere(tools, cli),
            mentionActive = mention != null,
            mentions = mention?.let {
                mentionResults(
                    it,
                    terms?.mentions?.get(target.project).orEmpty(),
                    branches = branches,
                    services = projectsState?.services?.get(target.project).orEmpty(),
                    computers = terms?.mentionComputers?.get(target.project).orEmpty()
                )
            } ?: MentionResults(),
            memoryAvailable = tools && projectsState?.project(target.project)?.isRemote != true,
            terminalCli = cli,
            composerActions = actions,
            variantCounts = counts
        )
    }.combine(warning) { state, sendWarning -> state.copy(sendWarning = sendWarning) }
        .combine(lpmCommands.notice) { state, notice -> state.copy(commandNotice = notice) }
        .combine(dictation.state) { state, take ->
            state.copy(dictation = take, dictationOwner = dictationOwner)
        }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            ComposerUiState(composer = store?.current ?: ComposerState())
        )

    val dictationMeter get() = dictation.meter
    val needsMicrophone: Boolean get() = dictation.needsMicrophone

    init {
        viewModelScope.launch {
            snapshotFlow { input.text.toString() }.collect { pushInput(it) }
        }
        serviceLogs?.let { logs -> viewModelScope.launch { logs.state.collect(::flushPendingLog) } }
        viewModelScope.launch {
            snapshotFlow { slashQuery(input.text.toString()) != null }
                .distinctUntilChanged()
                .collect { open -> if (open && lpmCommandsHere()) lpmCommands.menuOpened() }
        }
        store?.let { store ->
            viewModelScope.launch {
                store.state.map { it.text }.distinctUntilChanged().collect { text ->
                    if (text == synced) return@collect
                    synced = text
                    input.setTextAndPlaceCursorAtEnd(text)
                }
            }
        }
    }

    private fun pushInput(text: String) {
        if (text == synced) return
        synced = text
        store?.setText(text)
    }

    private val currentText: String get() = input.text.toString()

    /** Write the field programmatically, as typing would (it's mirrored to the Mac). */
    private fun replaceText(text: String) {
        input.setTextAndPlaceCursorAtEnd(text)
        pushInput(text)
    }

    /** The composer came on screen: fetch what its menus offer. */
    fun onAppear() {
        if (target.terminalTools) terminals?.loadSlash(target.termId, target.project)
        terminals?.loadMentions(target.project)
        composers?.loadComposerActions()
        projects?.loadServices(target.project)
        git?.loadBranches(target.project)
    }

    fun setFocused(focused: Boolean) {
        store?.isEditorFocused = focused
    }

    /** A special key: its raw sequence goes straight to the terminal. */
    fun key(sequence: String) {
        terminals?.input(target.termId, sequence)
    }

    // MARK: sending

    /**
     * Send the active tab — to [onSend] when the composer has its own destination
     * (an automation's reply), else into the terminal. True when it went out.
     */
    fun send(onSend: ((String) -> Unit)? = null): Boolean {
        if (lpmCommands.expanding || dictation.state.value.isActive(dictationOwner)) return false
        pushInput(input.text.toString())
        if (lpmCommandsHere() && lpmCommands.runTyped(slashRows(), terminalCli())) return true
        return sendComposed(onSend)
    }

    private fun sendComposed(onSend: ((String) -> Unit)?): Boolean {
        pushInput(input.text.toString())
        return when (val state = store?.current?.sendState ?: SendState.Empty) {
            SendState.Empty -> false

            SendState.Pending -> {
                warning.value = R.string.composer_still_uploading
                false
            }

            is SendState.Ready -> deliver(state.body, onSend)

            is SendState.DroppedFailures -> {
                warning.value = R.string.composer_dropped_failures
                deliver(state.body, onSend)
            }
        }
    }

    private fun lpmCommandsHere(): Boolean =
        lpmCommands.runHere(target.terminalTools, terminalCli())

    private fun terminalCli(): String = terminals?.state?.value.cli()

    /** The agent CLI running in this terminal, "" when none is known. */
    private fun TerminalsState?.cli(): String =
        this?.terminals?.get(target.project)?.firstOrNull { it.id == target.termId }?.cli.orEmpty()

    private fun slashRows() = terminals?.state?.value?.slashCommands?.get(target.termId).orEmpty()

    private fun deliver(body: String, onSend: ((String) -> Unit)?): Boolean {
        if (!submit(body, onSend)) return false
        if (body.isNotBlank()) {
            terminals?.recordHistory(
                target.project,
                target.termId,
                target.label,
                body
            )
        }
        noteSentCommand(body)
        store?.afterSend()
        dictation.noteSent()
        return true
    }

    private fun submit(text: String, onSend: ((String) -> Unit)?): Boolean {
        if (onSend != null) {
            onSend(text)
            return true
        }
        if (terminals?.submit(target.termId, text) == true) return true
        warning.value = R.string.composer_not_sent
        return false
    }

    /** Text straight into the terminal, leaving the tab alone ("Send now", the duplicates' first copy). */
    fun sendRaw(text: String, onSend: ((String) -> Unit)? = null) {
        if (text.isBlank() || !submit(text, onSend)) return
        terminals?.recordHistory(target.project, target.termId, target.label, text)
        noteSentCommand(text)
    }

    /** Counts a sent message that runs one of the agent's commands; an lpm skill counts on expanding. */
    private fun noteSentCommand(text: String) {
        val name = sentCommandName(text) ?: return
        val row = slashRows().firstOrNull { it.name.equals(name, ignoreCase = true) } ?: return
        if (!row.isLpm) {
            session?.store<LpmCommandsStore>()?.noteCommandUsed(
                target.project,
                row.name
            )
        }
    }

    fun saveDraft() {
        val text = currentText
        if (text.isBlank()) return
        history?.saveDraft(text, target.project, target.termId, target.label)
        warning.value = R.string.composer_saved_to_drafts
    }

    fun dismissWarning() {
        warning.value = null
    }

    // MARK: dictation

    fun startDictation() {
        val composer = store ?: return
        val tabId = composer.current.activeTab.id
        dictation.start(dictationOwner, target.session) { words ->
            composer.appendDictated(words, tabId)
        }
    }

    fun stopDictation() = dictation.stop()

    fun cancelDictation() = dictation.cancel()

    fun refuseDictation() = dictation.refuse(dictationOwner)

    /** The composer left the screen: its take ends, and the words stay in the draft. */
    fun leaveDictation() = dictation.leave(dictationOwner)

    // MARK: autocomplete

    fun pickSlash(command: SlashCommand) {
        if (command.isLpm && lpmCommands.pick(command, terminalCli())) return
        replaceText(replacingFragment(currentText, '/', "/${command.name} "))
    }

    fun dismissCommandNotice() = lpmCommands.dismissNotice()

    /** The field's text, for "Save as command". */
    val draftText: String get() = currentText.trim()

    fun pickPath(path: String) = replaceMention("@$path ")

    fun pickBranch(branch: String) = replaceMention("@$branch ")

    /** A place on another computer goes in as the Mac wrote it, without an "@". */
    fun pickPlace(place: MentionPlace) = replaceMention("${place.insert} ")

    private fun replaceMention(replacement: String) {
        val text = currentText
        if ('@' !in text) return
        replaceText(replacingFragment(text, '@', replacement))
    }

    private fun stripMentionFragment() {
        val text = currentText
        if ('@' in text) replaceText(text.substringBeforeLast('@'))
    }

    fun pickTerminalOutput() {
        stripMentionFragment()
        terminals?.captureTerminalOutput(target.termId, CONTEXT_LINES) { text ->
            store?.appendText(contextBlock("Terminal output", text), spaced = false)
        }
    }

    fun pickServiceLog(service: ServiceInfo) {
        val logs = serviceLogs ?: return
        val pane = service.paneIndex ?: return
        stripMentionFragment()
        pendingLog = PendingLog(logs.key(target.project, pane), "${service.name} logs")
        logs.fetch(target.project, pane, CONTEXT_LINES)
    }

    private fun flushPendingLog(state: ServiceLogsState) {
        val pending = pendingLog ?: return
        val text = state.results[pending.key] ?: return
        pendingLog = null
        serviceLogs?.consume(pending.key)
        store?.appendText(contextBlock(pending.label, text), spaced = false)
    }

    /** A history row or a memory invocation goes into the field. */
    fun load(text: String) = replaceText(text)

    fun insertInvocation(invocation: String) = replaceText(joined(currentText, invocation))

    // MARK: tabs and attachments

    fun newTab() = store?.newTab()

    fun switchTab(index: Int) = store?.switchTab(index)

    fun closeTab(index: Int) = store?.closeTab(index)

    fun addPicked(sources: List<PickedUri>) = store?.addPicked(sources)

    fun addImage(source: PickedUri) = store?.addImage(source)

    fun addFiles(sources: List<PickedUri>) = sources.forEach { store?.addFile(it) }

    fun retryUpload(id: String) = store?.retryUpload(id)

    fun removeAttachment(id: String) = store?.removeAttachment(id)

    fun dismissUploadError() = store?.dismissUploadError()

    // MARK: rewrite

    fun startRewrite(instruction: String, key: String) {
        pushInput(input.text.toString())
        store?.startTransform(instruction, uiState.value.variants(key))
    }

    fun setVariants(key: String, count: Int) {
        composers?.setVariantCount(key, count)
    }

    fun cancelRewrite() = store?.cancelTransform()

    fun applyVariant(text: String) = store?.applyVariant(text)

    fun variantsDismissed() = store?.variantsSheetDismissed()

    fun dismissRewriteError() = store?.dismissTransformError()

    private class PendingLog(val key: String, val label: String)

    private companion object {
        const val CONTEXT_LINES = 200
    }
}
