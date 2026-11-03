package cx.lpm.mobile.core.navigation

import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.serialization.Serializable

/** A project's lpm commands, pushed from the project menu: its own list and the global one. */
@Serializable
data class CommandsKey(val project: String, val session: SessionKey = SessionKey.Live) : NavKey

/** The same lists in a sheet with "Done", from the composer's "Manage commands". */
@Serializable
data class ManageCommandsKey(val project: String, val session: SessionKey = SessionKey.Live) :
    NavKey

/** One folder's commands; `folder` null is No folder. */
@Serializable
data class CommandFolderKey(
    val project: String,
    val scope: CommandScope,
    val folder: String?,
    val session: SessionKey = SessionKey.Live
) : NavKey

/**
 * The command editor in a sheet: `original` when editing one, else a new command. A
 * null `scope` puts a new one in the project's own list when it has one.
 */
@Serializable
data class CommandEditorKey(
    val project: String,
    val original: CommandRef? = null,
    val scope: CommandScope? = null,
    val folder: String? = null,
    val name: String = "",
    val description: String = "",
    val body: String = "",
    val session: SessionKey = SessionKey.Live
) : NavKey
