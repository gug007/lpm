package cx.lpm.mobile.feature.git.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitChecksStore
import cx.lpm.mobile.core.data.git.GitDiffKey
import cx.lpm.mobile.core.data.git.GitExtrasState
import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.feature.git.data.CommitDraft
import cx.lpm.mobile.feature.git.data.ReviewDraftsState
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * What the review screen keeps itself, as SwiftUI `@State`; the commit being written
 * lives in [ReviewDraftsStore], so leaving the screen keeps it.
 */
private data class ReviewLocal(
    val folds: Folds = Folds(),
    // The draft as it stood when the Mac was asked for a message: a reply that lands
    // after the user typed is dropped, so their text wins.
    val draftAtGenerate: String? = null,
    val autoDraftTried: Boolean = false,
    val focus: String? = null,
    val scope: ReviewScope = ReviewScope.Uncommitted,
    val branchFolds: Folds = Folds()
) {
    fun withFolds(scope: ReviewScope, change: (Folds) -> Folds) = if (scope == ReviewScope.Branch) {
        copy(branchFolds = change(branchFolds))
    } else {
        copy(folds = change(folds))
    }
}

/**
 * A project's uncommitted changes (iOS `GitReviewView`): the snapshot and every
 * file's diff from [GitStore], parsed here off the main thread, the commit form kept
 * in [ReviewDraftsStore], and "Ask agent…" into one of the project's terminals. A
 * [GitReviewKey.focus] file opens expanded, and the screen scrolls to it.
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
    private val drafts: ReviewDraftsStore? = session?.store()
    private val extras: GitExtrasStore? = session?.store()
    private val checks: GitChecksStore? = session?.store()
    private val branchKey = GitExtrasStore.branchKey(project)
    private val local = MutableStateFlow(ReviewLocal())
    private val parses = DiffParses(viewModelScope, parseDispatcher)
    private val branchParses = DiffParses(viewModelScope, parseDispatcher)
    private val scopeKey: String get() = if (local.value.scope ==
        ReviewScope.Branch
    ) {
        branchKey
    } else {
        project
    }

    /** The commit sheet's answers to what the look for secrets found. */
    val secrets = SecretCheck(project, extras, drafts)
    private val wraps: Boolean get() = prefs.bool(PreferenceKeys.GIT_REVIEW_WRAP) ?: true
    private val wrap = prefs.data.map { wraps }.distinctUntilChanged()

    private val draft: CommitDraft get() = drafts?.state?.value?.draft(project) ?: CommitDraft()

    val uiState: StateFlow<GitReviewUiState> = combine(
        combine(
            git?.state ?: flowOf(GitState()),
            drafts?.state ?: flowOf(ReviewDraftsState()),
            extras?.state ?: flowOf(GitExtrasState())
        ) { g, d, e -> Triple(g, d, e) },
        combine(
            terminals?.state ?: flowOf(TerminalsState()),
            checks?.state?.map { c ->
                c.results[project]?.pr?.let { OpenPullRequest(it.number, it.url) }
            }
                ?.distinctUntilChanged() ?: flowOf(null)
        ) { t, pr -> t to pr },
        local,
        combine(parses.parsed, branchParses.parsed) { p, bp -> p to bp },
        wrap
    ) { (g, d, e), (t, pr), l, (p, bp), w -> build(g, d, e, t, pr, l, p, bp, w) }
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
                store.state.map { s ->
                    s.diffs.filterKeys { it.project == branchKey }.mapKeys { it.key.path }
                }.distinctUntilChanged().collect(branchParses::update)
            }
            viewModelScope.launch {
                store.state.map { it.commitTick[project] to it.snapshots[project]?.branch }
                    .distinctUntilChanged().drop(1).collect {
                        if (local.value.scope == ReviewScope.Branch) extras?.loadBranch(project)
                    }
            }
            viewModelScope.launch {
                store.state.map { it.generatedMessage[project] }.distinctUntilChanged()
                    .filterNotNull().collect { message ->
                        takeGenerated(message)
                        store.consumeGeneratedMessage(project)
                    }
            }
            viewModelScope.launch {
                store.state.map { it.commitTick[project] }.distinctUntilChanged().drop(1).collect {
                    local.update { it.copy(draftAtGenerate = null, autoDraftTried = false) }
                }
            }
            key.focus?.let { focus ->
                viewModelScope.launch {
                    store.state.first { s ->
                        s.snapshots[project]?.files.orEmpty().any { it.path == focus }
                    }
                    local.update {
                        it.withFolds(ReviewScope.Uncommitted) { f ->
                            f.copy(collapsed = f.collapsed + (focus to false))
                        }.copy(focus = focus)
                    }
                }
            }
        }
        // A file changed again since it was viewed opens back up.
        drafts?.let { store ->
            viewModelScope.launch {
                store.state.map { it.changedSinceViewed[project] }.distinctUntilChanged()
                    .filterNotNull()
                    .collect { changed ->
                        local.update {
                            it.withFolds(ReviewScope.Uncommitted) { f ->
                                f.copy(collapsed = f.collapsed - changed.keys)
                            }
                        }
                    }
            }
        }
    }

    private fun takeGenerated(generated: String) {
        val at = local.value.draftAtGenerate
        if (at != null && draft.message == at) {
            drafts?.updateDraft(project) { it.copy(message = generated, drafted = generated) }
        }
        local.update { it.copy(draftAtGenerate = null, autoDraftTried = false) }
    }

    private fun build(
        g: GitState,
        d: ReviewDraftsState,
        e: GitExtrasState,
        t: TerminalsState,
        openPr: OpenPullRequest?,
        l: ReviewLocal,
        parsed: Map<String, ParsedDiff>,
        branchParsed: Map<String, ParsedDiff>,
        wrap: Boolean
    ): GitReviewUiState {
        val base = uncommittedReviewState(
            project = project,
            g = g,
            d = d,
            e = e,
            terminals = t.terminals[project].orEmpty(),
            folds = l.folds,
            listed = l.scope != ReviewScope.Branch,
            focus = l.focus,
            parsed = parsed,
            wrap = wrap,
            canDiscardFiles = git?.canDiscardFiles == true
        )
        val branch = e.branchScopes[project]
        val ready = base.copy(
            scopeAvailable = extras?.canBranchScope == true && g.snapshots[project]?.isRepo == true,
            scope = l.scope,
            branchFiles = branch?.files?.size,
            branchBase = branch?.base.orEmpty(),
            openPr = openPr
        )
        if (l.scope != ReviewScope.Branch) return ready
        return branchReviewState(ready, project, g, d, e, l.branchFolds, branchParsed)
    }

    private val selectedPaths: List<String>
        get() {
            val deselected = draft.deselected
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
        if (local.value.scope ==
            ReviewScope.Branch
        ) {
            extras?.loadBranch(project)
        } else {
            git?.load(project)
        }
    }

    /** Pull to refresh, held long enough for the spinner to read. */
    suspend fun refresh() {
        load()
        delay(REFRESH_HOLD_MS)
    }

    /** The switch at the top: the Branch scope loads what the branch changed. */
    fun setScope(scope: ReviewScope) {
        local.update { it.copy(scope = scope) }
        if (scope == ReviewScope.Branch) extras?.loadBranch(project)
    }

    /** A file came into view: fetch its diff if nothing has yet. */
    fun fileAppeared(path: String) {
        val store = git ?: return
        val key = GitDiffKey(scopeKey, path)
        val s = store.state.value
        if (s.diffs[key] == null && key !in s.diffLoading) store.loadDiff(scopeKey, path)
    }

    fun retryDiff(path: String) {
        git?.loadDiff(scopeKey, path)
    }

    fun toggleSelected(path: String) {
        drafts?.updateDraft(project) {
            val deselected = it.deselected
            it.copy(deselected = if (path in deselected) deselected - path else deselected + path)
        }
    }

    /** "Select All" / "Deselect All" in the commit sheet. */
    fun selectAll(selected: Boolean) {
        val paths = git?.state?.value?.snapshots?.get(project)?.files.orEmpty().map { it.path }
        drafts?.updateDraft(project) {
            it.copy(deselected = if (selected) emptySet() else paths.toSet())
        }
    }

    /** × on the draft over Commit: start the commit over. */
    fun clearDraft() {
        drafts?.clearCommitDraft(project)
    }

    fun toggleCollapsed(path: String) {
        val viewed = git?.state?.value?.isViewed(scopeKey, path) == true
        local.update {
            it.withFolds(it.scope) { f ->
                f.copy(
                    collapsed =
                        f.collapsed + (path to !(f.collapsed[path] ?: viewed))
                )
            }
        }
    }

    /** Marking a file viewed collapses it; unmarking opens it again. */
    fun toggleViewed(path: String) {
        val store = git ?: return
        val key = scopeKey
        val nowViewed = !store.state.value.isViewed(key, path)
        drafts?.toggleViewed(key, path)
        local.update {
            it.withFolds(it.scope) { f ->
                f.copy(
                    collapsed =
                        f.collapsed + (path to nowViewed)
                )
            }
        }
    }

    /** The screen scrolled to the file it opened on. */
    fun focusShown() = local.update { it.copy(focus = null) }

    fun showAll(path: String) = local.update {
        it.withFolds(it.scope) { f -> f.copy(expanded = f.expanded + path) }
    }

    /** "Wrap" in any file's bar: long lines wrap, or scroll sideways, in every file. */
    fun toggleWrap() = prefs.setBool(PreferenceKeys.GIT_REVIEW_WRAP, !wraps)

    fun setMessage(message: String) {
        drafts?.updateDraft(project) { it.copy(message = message) }
    }

    fun generateMessage() {
        val store = git ?: return
        val paths = selectedPaths
        if (paths.isEmpty() || project in store.state.value.generatingMessage) return
        local.update { it.copy(draftAtGenerate = draft.message) }
        store.genMessage(project, paths)
    }

    /**
     * The commit sheet came up: with no message yet, the Mac drafts one right away.
     * Once per draft: after a failed try the sheet waits for "Generate message".
     */
    fun commitOpened() {
        if (local.value.autoDraftTried || draft.message.isNotBlank()) return
        if (selectedPaths.isEmpty()) return
        if (project in git?.state?.value?.generatingMessage.orEmpty()) return
        local.update { it.copy(autoDraftTried = true) }
        generateMessage()
    }

    fun commit() {
        extras?.commit(project, draft.message.trim(), selectedPaths, push = false)
    }

    fun commitAndPush() {
        extras?.commit(project, draft.message.trim(), selectedPaths, push = true)
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
        val result = git?.state?.value?.diffs?.get(GitDiffKey(scopeKey, path))
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
