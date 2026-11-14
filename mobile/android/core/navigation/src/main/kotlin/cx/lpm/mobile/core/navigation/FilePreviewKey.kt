package cx.lpm.mobile.core.navigation

import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.serialization.Serializable

/**
 * A file on the Mac to preview: the readings of a tapped path (most likely first)
 * and the `:line` it named, or one path from a mention. [depth] counts the previews
 * under this one that a Markdown link opened it from, so a file can open over
 * itself, as on iOS, and each sheet is still its own destination. [promptTerminal]
 * is the terminal whose prompt Mention puts the file in, null where there's no
 * prompt to put it in.
 */
@Serializable
data class FilePreviewKey(
    val project: String,
    val paths: List<String>,
    val line: Int = 0,
    val session: SessionKey = SessionKey.Live,
    val depth: Int = 0,
    val promptTerminal: String? = null
) : NavKey
