package cx.lpm.mobile.feature.commands

import androidx.navigation3.runtime.EntryProviderScope
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.core.navigation.CommandFolderKey
import cx.lpm.mobile.core.navigation.CommandsKey
import cx.lpm.mobile.core.navigation.ManageCommandsKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.SheetPresentation
import cx.lpm.mobile.feature.commands.editor.CommandEditorRoute
import cx.lpm.mobile.feature.commands.folder.CommandFolderRoute
import cx.lpm.mobile.feature.commands.list.CommandsRoute

/**
 * A project's lpm commands: the Commands screen and a folder's commands pushed from
 * the project menu; the same in a sheet from the composer's "Manage commands"; and the
 * editor in a sheet from its "Save as command".
 */
fun EntryProviderScope<NavKey>.commandsEntries(navigator: Navigator) {
    entry<CommandsKey> { key ->
        CommandsRoute(key = key, onOpenFolder = navigator::navigate, onBack = navigator::back)
    }
    entry<CommandFolderKey> { key -> CommandFolderRoute(key = key, onBack = navigator::back) }
    entry<ManageCommandsKey>(metadata = SheetPresentation.metadata) { key ->
        ManageCommandsSheet(key = key, onDone = navigator::back)
    }
    entry<CommandEditorKey>(metadata = SheetPresentation.metadata) { key ->
        CommandEditorRoute(key = key, onDismiss = navigator::back)
    }
}
