package cx.lpm.mobile.feature.commands.editor

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.PickerSection
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.ui.scopeTitle

/** A folder of one list; null is its No folder. */
private data class Place(val scope: CommandScope, val folder: String?)

/**
 * "Folder": a menu `Picker` whose sections are the lists ("This project", "Global"),
 * each its folders then No folder. Choosing one sets both the list and the folder.
 */
@Composable
internal fun FolderPickerRow(
    places: List<PlaceGroup>,
    scope: CommandScope,
    folder: String?,
    onPick: (CommandScope, String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val noFolder = stringResource(R.string.commands_no_folder)
    PickerRow(
        title = stringResource(R.string.command_editor_folder),
        sections = places.map { group ->
            PickerSection(
                scopeTitle(group.scope),
                (group.folders + null).map { Place(group.scope, it) }
            )
        },
        selected = Place(scope, folder),
        onSelect = { onPick(it.scope, it.folder) },
        optionLabel = { it.folder ?: noFolder },
        modifier = modifier
    )
}
