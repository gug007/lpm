package cx.lpm.mobile.feature.commands.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import cx.lpm.mobile.core.navigation.CommandEditorKey
import cx.lpm.mobile.feature.commands.CommandsWatch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** What a Commands page holds while it shows: pull to refresh, and the command being edited. */
@Stable
internal class CommandsPageState(
    private val watch: CommandsWatch,
    private val scope: CoroutineScope
) {
    var refreshing by mutableStateOf(false)
        private set

    /** The editor sheet's command, new or saved; null while the sheet is closed. */
    var editing by mutableStateOf<CommandEditorKey?>(null)

    fun refresh() {
        scope.launch {
            refreshing = true
            watch.refresh()
            refreshing = false
        }
    }
}

/** A Commands page's state, with its project watched while the page shows. */
@Composable
internal fun rememberCommandsPage(watch: CommandsWatch): CommandsPageState {
    WatchCommands(watch)
    val scope = rememberCoroutineScope()
    return remember(watch) { CommandsPageState(watch, scope) }
}

/** Watches the project's lists while this is on screen. */
@Composable
internal fun WatchCommands(watch: CommandsWatch) {
    DisposableEffect(watch) {
        watch.open()
        onDispose { watch.close() }
    }
}
