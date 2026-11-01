package cx.lpm.mobile.feature.git.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitHistoryState
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.navigation.GitCommitKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/** One commit and its files; null `files` with no `error` is still loading. */
data class CommitDetailUiState(
    val commit: HistoryCommit,
    val files: List<CommitFile>? = null,
    val error: String? = null,
    val ready: Boolean = false
)

/** One commit of History (iOS `CommitDetailScreen`): its files from [GitHistoryStore]. */
@HiltViewModel(assistedFactory = CommitDetailViewModel.Factory::class)
class CommitDetailViewModel @AssistedInject constructor(
    @Assisted key: GitCommitKey,
    sessions: MacSessions
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: GitCommitKey): CommitDetailViewModel
    }

    private val project = key.project
    private val commit = key.commit
    private val session = sessions[key.session]
    private val history: GitHistoryStore? = session?.store()

    val uiState: StateFlow<CommitDetailUiState> = combine(
        history?.state ?: flowOf(GitHistoryState()),
        session?.state ?: flowOf(SessionState())
    ) { h, s ->
        val entry = h.files(project, commit.hash)
        CommitDetailUiState(commit, entry.files, entry.error, s.isReady)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CommitDetailUiState(commit))

    fun loadFiles() {
        history?.loadFiles(project, commit.hash)
    }
}
