package cx.lpm.mobile.feature.git.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitHistoryState
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.HistoryPatch
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.navigation.GitCommitFileKey
import cx.lpm.mobile.feature.git.di.DiffDispatcher
import cx.lpm.mobile.feature.git.diff.ParsedDiff
import cx.lpm.mobile.feature.git.review.extension
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.withContext

/** One file's patch in a commit, parsed once it lands, and whether long lines wrap. */
data class CommitFileDiffUiState(
    val file: CommitFile,
    val patch: HistoryPatch = HistoryPatch(),
    val parsed: ParsedDiff? = null,
    val wrap: Boolean = true,
    val ready: Boolean = false
)

/**
 * One file's patch in a commit (iOS `CommitFileDiffScreen`), from [GitHistoryStore],
 * parsed here off the main thread; "Wrap" is the review screen's own setting.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = CommitFileDiffViewModel.Factory::class)
class CommitFileDiffViewModel @AssistedInject constructor(
    @Assisted key: GitCommitFileKey,
    sessions: MacSessions,
    private val prefs: AppPreferences,
    @DiffDispatcher parseDispatcher: CoroutineDispatcher
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: GitCommitFileKey): CommitFileDiffViewModel
    }

    private val project = key.project
    private val hash = key.hash
    private val file = key.file
    private val session = sessions[key.session]
    private val history: GitHistoryStore? = session?.store()
    private val wraps: Boolean get() = prefs.bool(PreferenceKeys.GIT_REVIEW_WRAP) ?: true

    private val patch = (history?.state ?: flowOf(GitHistoryState()))
        .map { it.patch(project, hash, file.path) }
        .distinctUntilChanged()

    // A new patch drops the old parse until its own lands.
    private val parsed = patch.map {
        it.result?.diff
    }.distinctUntilChanged().transformLatest { diff ->
        emit(null)
        if (diff != null) {
            emit(withContext(parseDispatcher) { ParsedDiff.parse(diff, extension(file.path)) })
        }
    }

    val uiState: StateFlow<CommitFileDiffUiState> = combine(
        patch,
        parsed,
        prefs.data.map { wraps }.distinctUntilChanged(),
        session?.state ?: flowOf(SessionState())
    ) { p, parse, wrap, s -> CommitFileDiffUiState(file, p, parse, wrap, s.isReady) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            CommitFileDiffUiState(file, wrap = wraps)
        )

    fun load() {
        history?.loadPatch(project, hash, file)
    }

    /** "Wrap": long lines wrap, or scroll sideways, here and in Review Changes. */
    fun toggleWrap() = prefs.setBool(PreferenceKeys.GIT_REVIEW_WRAP, !wraps)
}
