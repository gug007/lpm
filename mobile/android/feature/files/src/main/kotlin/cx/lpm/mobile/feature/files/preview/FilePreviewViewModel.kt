package cx.lpm.mobile.feature.files.preview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.composerPrompts
import cx.lpm.mobile.core.navigation.FilePreviewKey
import cx.lpm.mobile.core.web.MarkdownFileReader
import cx.lpm.mobile.feature.files.di.PreviewDispatcher
import cx.lpm.mobile.feature.files.fetch.FileFetch
import cx.lpm.mobile.feature.files.fetch.FileFetches
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The preview sheet (iOS `FilePreviewSheet`): copies the file over from the Mac with
 * progress, then shows it by kind; reads a text file's contents, remembers Markdown's
 * Preview / Source choice, and fetches the images a Markdown file names. It knows the
 * file by its path in the project, as the Mac names it, for the next steps: Mention,
 * Diff and Copy Path.
 */
@HiltViewModel(assistedFactory = FilePreviewViewModel.Factory::class)
class FilePreviewViewModel @AssistedInject constructor(
    @Assisted private val key: FilePreviewKey,
    sessions: MacSessions,
    device: ThisDevice,
    private val prefs: AppPreferences,
    @param:PreviewDispatcher private val io: CoroutineDispatcher
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: FilePreviewKey): FilePreviewViewModel
    }

    /** What copy calls this device ("phone"). */
    val deviceNoun: String = device.noun

    /** Where a document's pages and images decode. */
    val renderDispatcher: CoroutineDispatcher = io

    private val session = sessions[key.session]
    private val git = session?.store<GitStore>()
    private val prompts = key.promptTerminal?.let { session?.composerPrompts() }
    private val fetches: FileFetches? = session?.store()
    private val fetch: FileFetch? = fetches?.fetch(key.project, key.paths)
    private val text = MutableStateFlow<Loaded?>(null)
    private val images = mutableListOf<FileFetch>()

    private val fetchState = fetch?.state ?: flowOf(
        FileFetch.State(
            path = key.paths.firstOrNull().orEmpty(),
            phase = FileFetch.Phase.Failed(GONE)
        )
    )

    val uiState: StateFlow<FilePreviewUiState> = combine(
        fetchState,
        text,
        prefs.data.map { prefs.bool(PreferenceKeys.FILE_PREVIEW_MARKDOWN_SOURCE) ?: false },
        git?.state?.map { it.snapshots[key.project] }?.distinctUntilChanged() ?: flowOf(null)
    ) { f, loaded, source, snapshot ->
        val inProject = projectPath(f.path, f.projectPath)
        FilePreviewUiState(
            path = f.path,
            phase = f.phase,
            received = f.received,
            total = f.total,
            text = loaded?.takeIf { it.file == (f.phase as? FileFetch.Phase.Ready)?.file }?.text,
            markdownSource = source,
            changedPath = changedPath(inProject, snapshot),
            projectPath = inProject ?: f.path,
            line = key.line,
            canMention = prompts != null
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        FilePreviewUiState(key.paths.firstOrNull().orEmpty(), line = key.line)
    )

    /** Serves the images a Markdown file names, fetched from the same Mac. */
    val imageReader = MarkdownFileReader { project, candidates ->
        val image = fetches?.fetch(project, candidates) ?: return@MarkdownFileReader null
        images += image
        (image.awaitDone() as? FileFetch.Phase.Ready)?.file
    }

    init {
        fetch?.start()
        if (git?.state?.value?.snapshots?.containsKey(key.project) == false) git.load(key.project)
        viewModelScope.launch {
            fetchState.map { it.phase }.distinctUntilChanged().collect { phase ->
                if (phase is FileFetch.Phase.Ready && phase.kind.isText) {
                    text.value = Loaded(phase.file, withContext(io) { read(phase) })
                }
            }
        }
    }

    fun retry() {
        fetch?.retry()
    }

    /** `@path[:line] ` at the end of the prompt of the terminal the file was opened from. */
    fun mention() {
        val terminal = key.promptTerminal ?: return
        val line = if (key.line > 0) ":${key.line}" else ""
        prompts?.append(terminal, "@${uiState.value.projectPath}$line ")
    }

    fun setMarkdownSource(source: Boolean) {
        prefs.setBool(PreferenceKeys.FILE_PREVIEW_MARKDOWN_SOURCE, source)
    }

    override fun onCleared() {
        fetch?.close()
        images.forEach(FileFetch::close)
    }

    private fun read(ready: FileFetch.Phase.Ready): String =
        runCatching { FilePreviewKind.decode(ready.file.readBytes()) }.getOrDefault("")

    private class Loaded(val file: File, val text: String)

    private companion object {
        const val GONE = "Disconnected from the Mac this file is on."
    }
}
