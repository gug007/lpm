package cx.lpm.mobile.feature.commands.list

import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.protocol.CommandFolderOp
import cx.lpm.mobile.feature.commands.CommandsWatch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** A page's changes to the folders of the list it shows, and the last one the Mac refused. */
internal class FolderChanges(
    private val watch: CommandsWatch,
    private val coroutines: CoroutineScope,
    private val list: () -> CommandScope
) {
    private val failure = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = failure.asStateFlow()

    fun create(name: String) = change(CommandFolderOp.Create, name)

    fun rename(folder: String, newName: String) = change(CommandFolderOp.Rename, folder, newName)

    fun delete(folder: String) = change(CommandFolderOp.Delete, folder)

    fun dismissError() {
        failure.value = null
    }

    private fun change(op: CommandFolderOp, name: String, newName: String? = null) {
        val store = watch.store ?: return
        val scope = list()
        coroutines.launch {
            val outcome = store.folder(watch.project, op, scope, name, newName)
            if (outcome is CommandOutcome.Failed) failure.value = outcome.error
        }
    }
}
