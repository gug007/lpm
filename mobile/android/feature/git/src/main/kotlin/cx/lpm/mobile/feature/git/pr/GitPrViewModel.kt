package cx.lpm.mobile.feature.git.pr

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.navigation.GitPullRequestKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Immutable
data class GitPrUiState(
    val title: String = "",
    val body: String = "",
    /** The issue the branch was started from, which the pull request closes. */
    val issue: Int? = null,
    val closeIssue: Boolean = true,
    val generating: Boolean = false,
    val creating: Boolean = false,
    /** Set once the pull request exists: the sheet shows it with Open. */
    val createdUrl: String? = null,
    val error: String? = null
) {
    val canCreate: Boolean get() = title.isNotBlank() && !creating && !generating
}

private data class PrDraft(
    val title: String = "",
    val body: String = "",
    val closeIssue: Boolean = true,
    val createdUrl: String? = null
)

/**
 * "Create Pull Request…" (iOS `GitPrSheet`): a title and description the AI can
 * draft, then Create — which pushes the branch first, so it can take a while.
 */
@HiltViewModel(assistedFactory = GitPrViewModel.Factory::class)
class GitPrViewModel @AssistedInject constructor(
    @Assisted key: GitPullRequestKey,
    sessions: MacSessions
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: GitPullRequestKey): GitPrViewModel
    }

    private val project = key.project
    private val git: GitStore? = sessions[key.session]?.store()
    private val draft = MutableStateFlow(PrDraft())

    val uiState: StateFlow<GitPrUiState> = combine(git?.state ?: flowOf(GitState()), draft, ::build)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GitPrUiState())

    init {
        git?.let { store ->
            viewModelScope.launch {
                store.state.map { it.prDraft[project] }.distinctUntilChanged().filterNotNull()
                    .collect { drafted ->
                        draft.update { it.copy(title = drafted.title, body = drafted.body) }
                        store.consumePrDraft(project)
                    }
            }
            viewModelScope.launch {
                store.state.map { it.createdPrUrl[project] }.distinctUntilChanged().filterNotNull()
                    .collect { url ->
                        draft.update { it.copy(createdUrl = url) }
                        store.consumeCreatedPrUrl(project)
                    }
            }
        }
    }

    private fun build(g: GitState, d: PrDraft) = GitPrUiState(
        title = d.title,
        body = d.body,
        issue = g.snapshots[project]?.issue,
        closeIssue = d.closeIssue,
        generating = project in g.generatingPr,
        creating = project in g.creatingPr,
        createdUrl = d.createdUrl,
        error = g.prError[project]
    )

    fun setTitle(title: String) = draft.update { it.copy(title = title) }

    fun setBody(body: String) = draft.update { it.copy(body = body) }

    fun setCloseIssue(on: Boolean) = draft.update { it.copy(closeIssue = on) }

    fun generate() {
        git?.genPr(project)
    }

    fun create() {
        val d = draft.value
        val issue = git?.state?.value?.snapshots?.get(project)?.issue
        git?.createPr(project, d.title.trim(), d.body, d.closeIssue.takeIf { issue != null })
    }

    fun dismissError() {
        git?.dismissPrError(project)
    }
}
