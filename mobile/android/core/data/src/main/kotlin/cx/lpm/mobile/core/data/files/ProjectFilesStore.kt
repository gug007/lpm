package cx.lpm.mobile.core.data.files

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestListDir
import cx.lpm.mobile.core.data.client.requestLocatePath
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.LocatedPath
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectDirContents
import cx.lpm.mobile.core.model.ProjectFileEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull

/** One folder as last listed. `entries` null with no `error` is still loading. */
data class ProjectFolderListing(
    val entries: List<ProjectFileEntry>? = null,
    val error: String? = null,
    val loading: Boolean = false
)

/** A folder of a project: its project-relative path, `""` for the root. */
data class ProjectFolderKey(val project: String, val dir: String)

data class ProjectFilesState(
    val folders: Map<ProjectFolderKey, ProjectFolderListing> = emptyMap(),
    /** project → its absolute folder on the Mac, once a reply has said. */
    val roots: Map<String, String> = emptyMap(),
    /** project → where the last path typed into its Go to File leads. */
    val located: Map<String, LocatedPath> = emptyMap()
) {
    /** Where [path] leads, null until the Mac has said. */
    fun located(project: String, path: String): LocatedPath? =
        located[project]?.takeIf { it.typed == path }

    fun folder(project: String, dir: String): ProjectFolderListing =
        folders[ProjectFolderKey(project, dir)] ?: ProjectFolderListing()
}

/** The Files browser's folders, keyed by project and project-relative folder (iOS `ProjectFilesStore`). */
class ProjectFilesStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(ProjectFilesState())
    val state: StateFlow<ProjectFilesState> = mutable.asStateFlow()

    private val timeout = GenerationTimeout<ProjectFolderKey>(session.scope)
    private val locateTimeout = GenerationTimeout<String>(session.scope)
    private val client: LpmClient? get() = session.client

    override fun wire(client: LpmClient) {
        client.onListDir = ::apply
        client.onLocatePath = ::apply
    }

    override fun reset() {
        mutable.value = ProjectFilesState()
        timeout.cancelAll()
        locateTimeout.cancelAll()
    }

    /** A folder waiting on a reply the dropped link took with it asks again. */
    override fun onConnectionReset() {
        state.value.folders.forEach { (key, listing) ->
            if (listing.loading) load(key.project, key.dir)
        }
    }

    /** The Mac lists project folders for Files. An SSH project's files are on the other host. */
    fun canBrowseFiles(project: Project): Boolean =
        client?.hostFeatures?.contains(LpmClient.LIST_DIR_FEATURE) == true && !project.isRemote

    /** A Mac that can be asked where a typed path leads. */
    val canLocatePaths: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.LOCATE_PATH_FEATURE) == true

    /** A Mac that doesn't answer leaves the path to the file index alone. */
    fun locate(project: String, path: String) {
        client?.requestLocatePath(project, path)
        locateTimeout.arm(project, LOCATE_TIMEOUT_MS) {
            hold(LocatedPath(project, typed = path, kind = null, path = "", rel = null))
        }
    }

    private fun apply(located: LocatedPath) {
        locateTimeout.cancel(located.project)
        hold(located)
    }

    private fun hold(located: LocatedPath) {
        mutable.update { it.copy(located = it.located + (located.project to located)) }
    }

    /** Ask for the folder again, keeping what's listed until the answer lands. */
    fun load(project: String, dir: String) {
        val key = ProjectFolderKey(project, dir)
        update(key) { it.copy(loading = true) }
        client?.requestListDir(project, dir)
        timeout.arm(key, TIMEOUT_MS) {
            update(key) { if (it.loading) it.copy(loading = false, error = TIMED_OUT) else it }
        }
    }

    /** Pull to refresh: ask again and hold the spinner until the answer lands. */
    suspend fun refresh(project: String, dir: String) {
        load(project, dir)
        withTimeoutOrNull(REFRESH_WAIT_MS) { state.first { !it.folder(project, dir).loading } }
    }

    private fun apply(contents: ProjectDirContents) {
        val key = ProjectFolderKey(contents.project, contents.dir)
        timeout.cancel(key)
        update(key) {
            ProjectFolderListing(entries = contents.entries, error = contents.error)
        }
        val root = contents.root ?: return
        mutable.update { it.copy(roots = it.roots + (contents.project to root)) }
    }

    private fun update(
        key: ProjectFolderKey,
        change: (ProjectFolderListing) -> ProjectFolderListing
    ) {
        mutable.update { s ->
            s.copy(folders = s.folders + (key to change(s.folders[key] ?: ProjectFolderListing())))
        }
    }

    private companion object {
        const val TIMEOUT_MS = 20_000L
        const val LOCATE_TIMEOUT_MS = 10_000L
        const val REFRESH_WAIT_MS = 5_000L
        const val TIMED_OUT = "The Mac didn't answer in time."
    }
}
