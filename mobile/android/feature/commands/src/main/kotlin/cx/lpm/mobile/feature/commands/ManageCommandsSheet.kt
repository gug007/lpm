package cx.lpm.mobile.feature.commands

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.navigation.ManageCommandsKey
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator
import cx.lpm.mobile.feature.commands.folder.CommandFolderHost
import cx.lpm.mobile.feature.commands.list.CommandsHost
import cx.lpm.mobile.feature.commands.ui.BackButton

/** A page of the "Manage commands" sheet: the lists, or one folder pushed over them. */
private sealed interface ManagePage {
    data object Lists : ManagePage

    data class Folder(val scope: CommandScope, val folder: String?) : ManagePage
}

/**
 * The Commands screen in a sheet with "Done", from the composer's "Manage commands"
 * (iOS presents it in a `NavigationStack`); a folder pushes inside the sheet.
 */
@Composable
fun ManageCommandsSheet(key: ManageCommandsKey, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val navigator = rememberSheetNavigator<ManagePage>(ManagePage.Lists)
    SheetStack(navigator, modifier.fillMaxSize()) { page ->
        when (page) {
            ManagePage.Lists -> CommandsHost(
                project = key.project,
                session = key.session,
                onOpenFolder = { scope, folder ->
                    navigator.push(ManagePage.Folder(scope, folder))
                },
                leading = {
                    GlassCapsuleButton(text = stringResource(R.string.done), onClick = onDone)
                },
                inSheet = true
            )

            is ManagePage.Folder -> CommandFolderHost(
                project = key.project,
                scope = page.scope,
                folder = page.folder,
                session = key.session,
                leading = { BackButton(navigator::back) },
                inSheet = true
            )
        }
    }
}
