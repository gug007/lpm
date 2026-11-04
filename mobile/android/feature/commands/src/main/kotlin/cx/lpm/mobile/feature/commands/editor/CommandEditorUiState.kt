package cx.lpm.mobile.feature.commands.editor

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.LpmCommandLists
import cx.lpm.mobile.core.model.isValidCommandName
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.core.navigation.CommandEditorKey

/** The command being written: where it goes, its name, its `/` menu line and its prompt. */
@Immutable
data class CommandDraft(
    val original: CommandRef?,
    val scope: CommandScope,
    val folder: String?,
    val name: String,
    val description: String,
    val body: String,
    val keepOutOfGit: Boolean = false
) {
    val place: CommandRef get() = CommandRef(scope, folder, name)

    val isValid: Boolean get() = isValidCommandName(name) && body.trimmingWhitespace().isNotEmpty()

    companion object {
        /**
         * The draft [key] opens; a new one with no list named goes in the project's own
         * unless the Mac said it has none.
         */
        fun of(key: CommandEditorKey, lists: LpmCommandLists?): CommandDraft = CommandDraft(
            original = key.original,
            scope = key.scope ?: lists?.scopes?.first() ?: CommandScope.Project,
            folder = key.folder,
            name = key.name,
            description = key.description,
            body = key.body,
            keepOutOfGit = key.keepOutOfGit
        )
    }
}

/** One list in the folder picker: its folders, then No folder. */
@Immutable
data class PlaceGroup(val scope: CommandScope, val folders: List<String>)

@Immutable
data class CommandEditorUiState(
    val draft: CommandDraft,
    val places: List<PlaceGroup> = emptyList(),
    val canKeepOutOfGit: Boolean = false,
    /** Keeping this committed skill out of Git needs saying before it's saved. */
    val warnCommitted: Boolean = false,
    val saving: Boolean = false,
    /** The Mac refused the save or delete; shown at the top. */
    val error: String? = null,
    /** Saved or deleted: the sheet slides away. */
    val done: Boolean = false,
    val feedback: HapticCue? = null
) {
    val isNew: Boolean get() = draft.original == null

    val canSave: Boolean get() = draft.isValid
}

/** Only a project's skills live in its repo, and an older lpm can't keep one out. */
internal fun canKeepOutOfGit(draft: CommandDraft, lists: LpmCommandLists?): Boolean =
    draft.scope == CommandScope.Project && lists?.project?.inRepo == true

internal fun warnsCommitted(draft: CommandDraft, lists: LpmCommandLists?): Boolean {
    val original = draft.original
    if (!draft.keepOutOfGit || original == null) return false
    val saved = lists?.list(original.scope)?.commands?.firstOrNull { it.ref == original }
    return saved?.tracked == true
}

/**
 * The lists the draft can go in (iOS `CommandEditorSheet.scopes`): global always, the
 * project's own when there is one, or while nothing has loaded yet for a draft headed there.
 * Each holds its folders plus the draft's own when the list doesn't have it yet, so the
 * picker always holds what's selected.
 */
internal fun placesFor(draft: CommandDraft, lists: LpmCommandLists?): List<PlaceGroup> {
    val scopes = lists?.scopes
        ?: CommandScope.entries.filter { it == CommandScope.Global || it == draft.scope }
    return scopes.map { scope ->
        val folders = lists?.list(scope)?.folders.orEmpty()
        val own = draft.folder?.takeIf { scope == draft.scope && it !in folders }
        PlaceGroup(scope, folders + listOfNotNull(own))
    }
}
