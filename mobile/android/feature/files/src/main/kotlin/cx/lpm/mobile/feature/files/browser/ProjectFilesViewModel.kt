package cx.lpm.mobile.feature.files.browser

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.LocatedKind
import cx.lpm.mobile.core.model.LocatedPath
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.ProjectFileEntry
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.core.navigation.ProjectFilesKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ProjectFilesUiState(
    /** The folder's name; empty for the project's own folder ("Files"). */
    val folderName: String = "",
    /** Null while the folder loads, or when it failed ([error]). */
    val entries: List<ProjectFileEntry>? = null,
    val error: String? = null,
    /** The project's folder on the Mac, once known: "Copy Path" needs it. */
    val root: String? = null,
    val query: String = "",
    /** Go to File's results; null while the project's file index loads. */
    val hits: List<MentionEntry>? = null,
    /** The query when it is a path the Mac can be asked about. */
    val path: String? = null,
    /** Where [path] leads; null until the Mac has said. */
    val located: LocatedPath? = null
) {
    /** The trimmed query; while it holds anything, Go to File's results replace the folder. */
    val search: String get() = query.trimmingWhitespace()

    /** [path] gets a row of its own above the results: it's being looked for, or is there. */
    val showsPath: Boolean
        get() = path != null &&
            (located == null || located.kind == LocatedKind.FILE || located.kind == LocatedKind.DIR)

    /** [path] leads nowhere. */
    val pathMissing: Boolean get() = path != null && located?.kind == LocatedKind.MISSING
}

/**
 * One folder of a project, as the desktop's Files tab lists it (iOS
 * `ProjectFilesScreen`), and Go to File over the project's file index (the composer's
 * @-mention list).
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ProjectFilesViewModel.Factory::class)
class ProjectFilesViewModel @AssistedInject constructor(
    @Assisted val key: ProjectFilesKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]
    private val query = MutableStateFlow("")
    private var locating: Job? = null

    val uiState: StateFlow<ProjectFilesUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::filesState) ?: flowOf(ProjectFilesUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProjectFilesUiState())

    private fun filesState(s: MacSession) = combine(
        s.store<ProjectFilesStore>().state,
        s.store<TerminalsStore>().state,
        query
    ) { files, terminals, query ->
        val folder = files.folder(key.project, key.dir)
        val search = query.trimmingWhitespace()
        val path = typedPath(query)?.takeIf { s.store<ProjectFilesStore>().canLocatePaths }
        ProjectFilesUiState(
            folderName = fileName(key.dir).ifEmpty { key.dir },
            entries = folder.entries,
            error = folder.error,
            root = files.roots[key.project],
            query = query,
            hits = if (search.isEmpty()) {
                null
            } else {
                terminals.mentions[key.project]?.let { goToFileMatches(it, search) }
            },
            path = path,
            located = path?.let { files.located(key.project, it) }
        )
    }

    /** The screen came up: list the folder again, and read the index Go to File searches. */
    fun load() {
        val s = session ?: return
        s.store<ProjectFilesStore>().load(key.project, key.dir)
        s.store<TerminalsStore>().loadMentions(key.project)
    }

    fun retry() {
        session?.store<ProjectFilesStore>()?.load(key.project, key.dir)
    }

    suspend fun refresh() {
        session?.store<ProjectFilesStore>()?.refresh(key.project, key.dir)
    }

    fun setQuery(text: String) {
        query.value = text
        locating?.cancel()
        val store = session?.store<ProjectFilesStore>() ?: return
        val path = typedPath(text)?.takeIf { store.canLocatePaths } ?: return
        locating = viewModelScope.launch {
            delay(LOCATE_PAUSE_MS)
            store.locate(key.project, path)
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(key: ProjectFilesKey): ProjectFilesViewModel
    }

    private companion object {
        const val LOCATE_PAUSE_MS = 250L
    }
}
