package cx.lpm.mobile.feature.commands

import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.coroutines.delay

/**
 * A screen's hold on [project]'s lists in its session's store: watched while it shows,
 * so a change push or a reconnect refreshes them, and fetched again on a pull.
 */
internal class CommandsWatch(
    private val sessions: MacSessions,
    private val session: SessionKey,
    val project: String
) {
    val store: LpmCommandsStore? get() = sessions[session]?.store()

    fun open() {
        store?.open(project)
    }

    fun close() {
        store?.close(project)
    }

    /** Pull to refresh asks again and keeps its spinner up a moment. */
    suspend fun refresh() {
        store?.load(project)
        delay(REFRESH_SETTLE_MS)
    }

    private companion object {
        const val REFRESH_SETTLE_MS = 600L
    }
}
