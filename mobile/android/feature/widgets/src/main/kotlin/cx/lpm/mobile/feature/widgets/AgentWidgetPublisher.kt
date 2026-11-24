package cx.lpm.mobile.feature.widgets

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.link.LinkState
import cx.lpm.mobile.core.data.mac.LastAnswers
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.widget.AgentWidgetStore
import cx.lpm.mobile.core.model.AgentWidgetMac
import cx.lpm.mobile.core.model.agentWidgetRows
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNot
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Keeps the Agents widget in step with the live Mac (iOS `AgentWidgetPublisher`):
 * writes its rows once they've settled for a second, so a burst of status changes
 * is one write, and drops the rows and kept answers of Macs the phone no longer has. Leaving the app
 * stamps them as seen then, the last the phone hears of the Mac until it's back.
 */
@Singleton
class AgentWidgetPublisher @Inject constructor(
    private val session: MacSession,
    private val store: AgentWidgetStore,
    private val answers: LastAnswers,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    private var live: AgentWidgetMac? = null

    fun start() {
        scope.launch {
            combine(
                session.state,
                session.link.state,
                session.store<ProjectsStore>().state,
                session.store<TerminalsStore>().state,
                ::liveMac
            ).distinctUntilChanged().collectLatest { mac ->
                live = mac
                mac ?: return@collectLatest
                delay(SETTLE_MS)
                withContext(Dispatchers.IO) { store.publish(mac) }
            }
        }
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStop(owner: LifecycleOwner) {
                    val mac = live ?: return
                    scope.launch(Dispatchers.IO) { store.confirm(mac) }
                }
            }
        )
        scope.launch {
            session.state
                .filterNot { it.demoMode }
                .map { state -> state.macs.map { it.widgetId }.toSet() }
                .distinctUntilChanged()
                .collect { kept ->
                    withContext(Dispatchers.IO) {
                        val gone = store.macs.value.map { it.id }.toSet() - kept
                        if (gone.isNotEmpty()) store.remove(gone)
                        answers.keep(kept)
                    }
                }
        }
    }

    private companion object {
        const val SETTLE_MS = 1_000L
    }
}

/**
 * The live Mac's agents as the widget lists them; null while what's on screen isn't
 * the Mac's live list — a saved copy, a pairing, a link that's down.
 */
internal fun liveMac(
    state: SessionState,
    link: LinkState,
    projects: ProjectsState,
    terminals: TerminalsState
): AgentWidgetMac? {
    if (!state.isReady || !projects.projectsLoaded || link.listAsOf != null ||
        link.pairing
    ) {
        return null
    }
    val record = state.activeRecord ?: return null
    return AgentWidgetMac(
        id = record.widgetId,
        rows = agentWidgetRows(
            projects.projects,
            terminals.terminalTitles,
            System.currentTimeMillis()
        ),
        name = record.displayName
    )
}
