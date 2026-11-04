package cx.lpm.mobile.feature.commands.list

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.commands.LpmCommandsState
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommandList

/** One folder row (null for No folder) and how many commands it holds. */
@Immutable
data class FolderRowUi(val folder: String?, val count: Int)

@Immutable
data class CommandsUiState(
    /** The segments: global always, this project's own unless there is none. */
    val scopes: List<CommandScope> = listOf(CommandScope.Global),
    /** The list showing. */
    val scope: CommandScope = CommandScope.Global,
    /** Both lists have come; nothing to show (but a spinner or a failure) before. */
    val loaded: Boolean = false,
    /** The showing list's folders, then No folder; empty while it can't be read. */
    val folders: List<FolderRowUi> = emptyList(),
    /** The list itself is there, so its folders and "New folder" show. */
    val hasList: Boolean = false,
    /** How many skills not made in lpm the showing list has outside its folders. */
    val otherSkills: Int = 0,
    /** Why the project's own list couldn't be read, shown over it. */
    val projectError: String? = null,
    val loadError: String? = null,
    /** A folder change the Mac refused. */
    val changeError: String? = null
)

/**
 * The screen's view of the store (iOS `CommandsScreen`): a project with no list of
 * its own (outside a project, or one the Mac said has none) shows only Global.
 */
internal fun LpmCommandsState.commandsUiState(
    project: String,
    picked: CommandScope,
    changeError: String?
): CommandsUiState {
    val lists = lists[project]
    val scopes = when {
        project.isEmpty() -> listOf(CommandScope.Global)

        // A project list that couldn't be read keeps its segment, to say why.
        lists == null || lists.projectError != null -> CommandScope.entries

        else -> lists.scopes
    }
    val scope = if (picked in scopes) picked else CommandScope.Global
    val list = lists?.list(scope)
    return CommandsUiState(
        scopes = scopes,
        scope = scope,
        loaded = lists != null,
        folders = list?.folderRows().orEmpty(),
        hasList = list != null,
        otherSkills = list?.othersIn(null)?.size ?: 0,
        projectError = lists?.projectError?.takeIf { scope == CommandScope.Project },
        loadError = loadError[project].takeIf { lists == null },
        changeError = changeError
    )
}

private fun LpmCommandList.folderRows(): List<FolderRowUi> =
    (folders + listOf<String?>(null)).map { folder ->
        val others = if (folder == null) 0 else othersIn(folder).size
        FolderRowUi(folder, inFolder(folder).size + others)
    }
