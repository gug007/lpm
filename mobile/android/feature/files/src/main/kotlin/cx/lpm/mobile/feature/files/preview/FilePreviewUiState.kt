package cx.lpm.mobile.feature.files.preview

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.feature.files.fetch.FileFetch
import cx.lpm.mobile.feature.files.fetch.FilePreviewKind
import cx.lpm.mobile.feature.files.fetch.lastPathComponent
import java.io.File

@Immutable
data class FilePreviewUiState(
    /** The file's path on the Mac (the reading being fetched). */
    val path: String,
    val phase: FileFetch.Phase = FileFetch.Phase.Loading,
    val received: Long = 0,
    val total: Long? = null,
    /** A text or Markdown file's contents once read off the copy; null until then. */
    val text: String? = null,
    /** Markdown shows its source rather than the rendered page (remembered for every file). */
    val markdownSource: Boolean = false,
    /** The file as git lists it, when it has changes: Diff opens Changes on it. */
    val changedPath: String? = null,
    /** The path the project knows the file by, else the Mac's: for Mention and Copy Path. */
    val projectPath: String = path,
    /** The line the tapped path named; 0 for none. */
    val line: Int = 0,
    /** Mention puts the file in the prompt of the terminal it was opened from. */
    val canMention: Boolean = false,
    /** A whole, small text file in the project, on a Mac that saves edits: Edit shows. */
    val editable: Boolean = false
) {
    val filename: String get() = lastPathComponent(path)

    /** The folder over the name; "" for a file at the project's top. */
    val folder: String get() = parentPath(projectPath)

    /** The next steps show under a file once it's here. */
    val ready: Boolean get() = phase is FileFetch.Phase.Ready

    /** The copy to share: a whole file, never the head of a long text. */
    val shareable: File?
        get() = (phase as? FileFetch.Phase.Ready)?.takeUnless { it.truncated }?.file

    /** Markdown's Preview / Source switch sits on a bar that reaches up behind the title. */
    val barred: Boolean get() = (phase as? FileFetch.Phase.Ready)?.kind == FilePreviewKind.Markdown

    /** A bar fills in for a file of several ranges; a spinner turns for one. */
    val progress: Float?
        get() = total?.takeIf { it > FileFetch.CHUNK_SIZE }?.let { received.toFloat() / it }
}
