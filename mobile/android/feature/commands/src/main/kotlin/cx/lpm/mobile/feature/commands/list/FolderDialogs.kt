package cx.lpm.mobile.feature.commands.list

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.AlertTextField
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.feature.commands.R

/** The folder dialog showing on the Commands screen, if any. */
sealed interface FolderDialog {
    data object Create : FolderDialog

    data class Rename(val folder: String) : FolderDialog

    data class Delete(val folder: String) : FolderDialog
}

/** "New folder", "Rename folder" and "Delete the … folder?", as iOS's alerts. */
@Composable
internal fun FolderDialogs(
    dialog: FolderDialog?,
    onCreate: (String) -> Unit,
    onRename: (folder: String, newName: String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit
) {
    when (dialog) {
        null -> Unit

        FolderDialog.Create -> FolderNameAlert(
            title = stringResource(R.string.commands_new_folder),
            initial = "",
            confirm = stringResource(R.string.commands_create),
            onConfirm = onCreate,
            onDismiss = onDismiss
        )

        is FolderDialog.Rename -> FolderNameAlert(
            title = stringResource(R.string.commands_rename_folder),
            initial = dialog.folder,
            confirm = stringResource(R.string.commands_rename),
            onConfirm = { onRename(dialog.folder, it) },
            onDismiss = onDismiss
        )

        is FolderDialog.Delete -> LpmAlert(
            title = stringResource(R.string.commands_delete_folder_title, dialog.folder),
            message = stringResource(R.string.commands_delete_folder_message),
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.commands_delete_folder),
                    AlertRole.Destructive
                ) { onDelete(dialog.folder) },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = onDismiss
        )
    }
}

@Composable
private fun FolderNameAlert(
    title: String,
    initial: String,
    confirm: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var name by rememberSaveable { mutableStateOf(initial) }
    LpmAlert(
        title = title,
        textField = {
            AlertTextField(name, { name = it }, stringResource(R.string.commands_folder_name))
        },
        buttons = listOf(
            AlertButton(stringResource(R.string.cancel), AlertRole.Cancel),
            AlertButton(confirm) { onConfirm(name) }
        ),
        onDismissRequest = onDismiss
    )
}
