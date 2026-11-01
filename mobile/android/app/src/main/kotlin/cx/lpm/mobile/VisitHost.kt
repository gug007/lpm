package cx.lpm.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.Navigator
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.feature.connection.ConnectionSheets
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeCustomTimeRoute
import cx.lpm.mobile.feature.mac.keepawake.KeepAwakeSectionRoute
import cx.lpm.mobile.feature.mac.update.MacUpdateSectionRoute
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map

/**
 * What a machine visit brings beside its screens: the connection sheets of its own
 * session, and — once the visit ends (a switch, a removal) — its screens closed, as
 * iOS drops the visit's navigation destination.
 */
@Composable
internal fun VisitHost(session: MacSession, navigator: Navigator) {
    val visit by session.visitSession.collectAsStateWithLifecycle()
    visit?.key?.let { key ->
        ConnectionSheets(
            key,
            macUpdateSection = { MacUpdateSectionRoute(key) },
            keepAwakeSection = { open -> KeepAwakeSectionRoute(key, onCustomTime = open) },
            keepAwakeCustomTime = { onDone -> KeepAwakeCustomTimeRoute(key, onDone = onDone) }
        )
    }
    LaunchedEffect(session, navigator) {
        session.visitSession
            .map { it == null }
            .distinctUntilChanged()
            .filter { it }
            .collect { navigator.popFrom(::opensVisit) }
    }
}

/** A visit begins at the project or terminal of a machine opened from a live screen. */
private fun opensVisit(key: NavKey): Boolean = when (key) {
    is ProjectKey -> key.session is SessionKey.Visit
    is TerminalKey -> key.session is SessionKey.Visit
    else -> false
}
