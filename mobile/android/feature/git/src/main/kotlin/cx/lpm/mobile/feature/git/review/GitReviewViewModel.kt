package cx.lpm.mobile.feature.git.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitDiffKey
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.feature.git.di.DiffDispatcher
import cx.lpm.mobile.feature.git.diff.ParsedDiff
import cx.lpm.mobile.feature.git.diff.promptDiff
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What the review screen keeps itself, as SwiftUI `@State`. */
private data class ReviewLocal(
    val message: String = "",
    // Files the user unchecked: everything else stays selected, so new changes are
    // picked up and deselections survive a refresh.
    val deselected: Set<String> = emptySet(),
    val collapsed: Map<String, Boolean> = emptyMap(),
    val expanded: Set<String> = emptySet(),
    // The message the Mac last drafted, and the draft as it stood when it was asked
    // for: a reply that lands after the user typed is dropped, so their text wins.
    val drafted: String? = null,
    val draftAtGenerate: String? = null,
    val autoDraftTried: Boolean = false
) {
    fun withGenerated(generated: String): ReviewLocal {
        val untouched = draftAtGenerate != null && message == draftAtGenerate
        return copy(
            message = if (untouched) generated else message,
            drafted = if (untouched) generated else drafted,
            draftAtGenerate = null,
            autoDraftTried = false
        )
    }
}

/**
 * A project's uncommitted changes (iOS `GitReviewView`): the snapshot and every
 * file's diff from [GitStore], parsed here off the main thread, the commit form,
 * and "Ask agent…" into one of the project's terminals.
 */
@HiltViewModel(assistedFactory = GitReviewViewModel.Factory::class)
class GitReviewViewModel @AssistedInject constructor(
    @Assisted key: GitReviewKey,
    sessions: MacSessions,
    private val prefs: AppPreferences,
    @DiffDispatcher parseDispatcher: CoroutineDispatcher
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: GitReviewKey): GitReviewViewModel
    }

    private val project = key.project
    private val session = sessions[key.session]
    private val git: GitStore? = session?.store()
    private val terminals: TerminalsStore? = session?.store()
    private val local = MutableStateFlow(ReviewLocal())
    private val parses = DiffParses(viewModelScope, parseDispatcher)
    private val wraps: Boolean get() = prefs.bool(PreferenceKeys.GIT_REVIEW_WRAP) ?: true
    private val wrap = prefs.data.map { wraps }.distinctUntilChanged()

    val uiState: StateFlow<GitReviewUiState> = combine(
        git?.state ?: flowOf(GitState()),
        terminals?.state ?: flowOf(TerminalsState()),
        local,
        parses.parsed,
        wrap
    ) { g, t, l, p, w -> build(g, t, l, p, w) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            GitReviewUiState(project = project)
        )

    init {
        git?.let { store ->
            viewModelScope.launch {
                store.state.map { s ->
                    s.diffs.filterKeys { it.project == project }.mapKeys { it.key.path }
                }.distinctUntilChanged().collect(parses::update)
            }
            viewModelScope.launch {
                store.state.map { it.generatedMessage[project] }.distinctUntilChanged()
                    .filterNotNull().collect { message ->
                        local.update { it.withGenerated(message) }
                        store.consumeGeneratedMessage(project)
                    }
            }
            viewModelScope.launch {
                store.state.map { it.commitTick[project] }.distinctUntilChanged().drop(1).collect {
                    local.update {
                        it.copy(
                            message = "",
                            deselected = emptySet(),
                            drafted = null,
                            draftAtGenerate = null,
                            autoDraftTried = false
                        )
                    }
                }
            }
        }
    }

    private fun build(
        g: GitState,
        t: TerminalsState,
        l: ReviewLocal,
        parsed: Map<String, ParsedDiff>,
        wrap: Boolean
    ): GitReviewUiState {
        val snapshot = g.snapshots[project]
        val files = snapshot?.files.orEmpty()
        val review = files.map { file ->
            val key = GitDiffKey(project, file.path)
            val viewed = g.isViewed(project, file.path)
            ReviewFile(
                file = file,
                result = g.diffs[key],
                error = g.diffError[key],
                parsed = parsed[file.path],
                selected = file.path !in l.deselected,
                viewed = viewed,
                collapsed = l.collapsed[file.path] ?: viewed,
                expanded = file.path in l.expanded
            )
        }
        val selected = review.count { it.selected }
        val committing = project in g.committing
        val pushing = project in g.pushing
        val pushes = project in g.commitPushing
        val loading = project in g.loading
        val repo = snapshot?.isRepo == true
        val overlay = when {
            snapshot != null -> when {
                !snapshot.isRepo -> ReviewOverlay.NotRepo
                files.isEmpty() -> ReviewOverlay.NoChanges
                else -> null
            }

            g.loadError[project] != null && !loading -> ReviewOverlay.Unreachable

            else -> ReviewOverlay.Skeleton
        }
        return GitReviewUiState(
            project = project,
            overlay = overlay,
            loadError = g.loadError[project],
            ghCli = snapshot?.ghCli == true,
            rows = if (repo) reviewRows(review, snapshot.ghCli) else emptyList(),
            wrap = wrap,
            commitFiles = if (repo) {
                review.map {
                    CommitFile(it.file, it.selected, it.parsed?.addedCount, it.parsed?.removedCount)
                }
            } else {
                emptyList()
            },
            conflicted = files.filter { it.isConflicted }.map { it.path },
            added = review.sumOf { it.parsed?.addedCount ?: 0 },
            removed = review.sumOf { it.parsed?.removedCount ?: 0 },
            message = l.message,
            drafted = l.drafted != null && l.message == l.drafted,
            selectedCount = selected,
            branch = snapshot?.takeUnless { it.detached || it.branch.isEmpty() }?.branch,
            generating = project in g.generatingMessage,
            busy = when {
                committing && pushes -> CommitBusy.Committing
                committing -> CommitBusy.CommittingOnly
                pushing && pushes -> CommitBusy.Pushing
                else -> null
            },
            canCommit = selected > 0 && l.message.isNotBlank() && !committing && !pushing,
            commitTick = g.commitTick[project] ?: 0,
            opError = g.opError[project],
            notice = g.notice[project],
            canDiscardFiles = git?.canDiscardFiles == true,
            discarding = project in g.discarding,
            terminals = t.terminals[project].orEmpty()
        )
    }

    private val selectedPaths: List<String>
        get() {
            val deselected = local.value.deselected
            val files = git?.state?.value?.snapshots?.get(project)?.files.orEmpty()
            return files.map { it.path }.filterNot { it in deselected }
        }

    /**
     * The screen came up: follow the working tree while it's open. The watch only
     * reports changes from here on, so whatever changed since the last snapshot is
     * fetched now.
     */
    fun appear() {
        val store = git ?: return
        store.watch(project)
        store.refreshWatched(project)
    }

    fun disappear() {
        git?.unwatch(project)
    }

    /** Back in the foreground: catch up on what changed meanwhile. */
    fun resume() {
        git?.refreshWatched(project)
    }

    fun load() {
        git?.load(project)
    }

    /** Pull to refresh, held long enough for the spinner to read. */
    suspend fun refresh() {
        git?.load(project)
        delay(REFRESH_HOLD_MS)
    }

    /** A file came into view: fetch its diff if nothing has yet. */
    fun fileAppeared(path: String) {
        val store = git ?: return
        val key = GitDiffKey(project, path)
        val s = store.state.value
        if (s.diffs[key] == null && key !in s.diffLoading) store.loadDiff(project, path)
    }

    fun retryDiff(path: String) {
        git?.loadDiff(project, path)
    }

    fun toggleSelected(path: String) = local.update {
        it.copy(
            deselected = if (path in
                it.deselected
            ) {
                it.deselected - path
            } else {
                it.deselected + path
            }
        )
    }

    /** "Select All" / "Deselect All" in the commit sheet. */
    fun selectAll(selected: Boolean) {
        val paths = git?.state?.value?.snapshots?.get(project)?.files.orEmpty().map { it.path }
        local.update { it.copy(deselected = if (selected) emptySet() else paths.toSet()) }
    }

    fun toggleCollapsed(path: String) {
        val viewed = git?.state?.value?.isViewed(project, path) == true
        local.update {
            it.copy(collapsed = it.collapsed + (path to !(it.collapsed[path] ?: viewed)))
        }
    }

    /** Marking a file viewed collapses it; unmarking opens it again. */
    fun toggleViewed(path: String) {
        val store = git ?: return
        val nowViewed = !store.state.value.isViewed(project, path)
        store.toggleViewed(project, path)
        local.update { it.copy(collapsed = it.collapsed + (path to nowViewed)) }
    }

    fun showAll(path: String) = local.update { it.copy(expanded = it.expanded + path) }

    /** "Wrap" in any file's bar: long lines wrap, or scroll sideways, in every file. */
    fun toggleWrap() = prefs.setBool(PreferenceKeys.GIT_REVIEW_WRAP, !wraps)

    fun setMessage(message: String) = local.update { it.copy(message = message) }

    fun generateMessage() {
        val store = git ?: return
        val paths = selectedPaths
        if (paths.isEmpty() || project in store.state.value.generatingMessage) return
        local.update { it.copy(draftAtGenerate = it.message) }
        store.genMessage(project, paths)
    }

    /**
     * The commit sheet came up: with no message yet, the Mac drafts one right away.
     * Once per draft: after a failed try the sheet waits for "Generate message".
     */
    fun commitOpened() {
        val l = local.value
        if (l.autoDraftTried || l.message.isNotBlank() || selectedPaths.isEmpty()) return
        if (project in git?.state?.value?.generatingMessage.orEmpty()) return
        local.update { it.copy(autoDraftTried = true) }
        generateMessage()
    }

    fun commit() {
        git?.commit(project, local.value.message.trim(), selectedPaths)
    }

    fun commitAndPush() {
        git?.commitAndPush(project, local.value.message.trim(), selectedPaths)
    }

    fun dismissOpError() {
        git?.dismissOpError(project)
    }

    /** "Discard Changes…" on one file, once confirmed: Undo follows on the notice. */
    fun discardFile(path: String) {
        git?.discardFile(project, path)
    }

    /** Undo on a discard's notice: [id] names the copy the Mac kept. */
    fun restoreDiscarded(id: String) {
        git?.restoreDiscarded(project, id)
    }

    /** "Ask agent…" about one file: its diff without the file-header noise. */
    fun askContext(path: String): AskContext {
        val result = git?.state?.value?.diffs?.get(GitDiffKey(project, path))
        val diff = if (result == null || result.binary) "" else promptDiff(result.diff)
        return AskContext(path, diff)
    }

    /** Hand [prompt] to [terminal]: it goes in once the terminal's screen has seeded. */
    fun sendToAgent(terminal: TerminalInfo, prompt: String) {
        terminals?.recordHistory(project, terminal.id, terminal.label, prompt)
        terminals?.queuePrompt(terminal.id, prompt)
    }

    private companion object {
        const val REFRESH_HOLD_MS = 600L
    }
}
