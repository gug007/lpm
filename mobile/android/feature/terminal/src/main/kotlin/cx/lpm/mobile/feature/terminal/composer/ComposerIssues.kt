package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.IssueRead
import cx.lpm.mobile.core.model.RepoIssue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** The repository's open issues in the @-mention menu, and the one picked going in the prompt. */
internal class ComposerIssues(
    private val store: GitExtrasStore?,
    private val project: String,
    private val scope: CoroutineScope,
    private val insert: (String) -> Unit
) {
    val open: Flow<List<RepoIssue>> =
        store?.state?.map { it.issues[project].orEmpty() }?.distinctUntilChanged()
            ?: flowOf(emptyList())

    private val mutableError = MutableStateFlow<String?>(null)

    /** Why the picked issue couldn't go in. */
    val error: StateFlow<String?> = mutableError.asStateFlow()

    fun load() = store?.loadIssues(project)

    fun pick(issue: RepoIssue) {
        val store = store ?: return
        scope.launch {
            when (val read = store.readIssue(project, issue.number)) {
                is IssueRead.Done -> insert(read.mention)
                is IssueRead.Failed -> mutableError.value = read.error
            }
        }
    }

    fun dismissError() {
        mutableError.value = null
    }
}
