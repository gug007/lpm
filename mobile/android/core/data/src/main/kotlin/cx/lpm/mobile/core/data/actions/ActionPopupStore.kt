package cx.lpm.mobile.core.data.actions

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestActionPopup
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPopupContent
import cx.lpm.mobile.core.model.ActionPopupCopy
import cx.lpm.mobile.core.model.ActionPopupInfo
import cx.lpm.mobile.core.model.ActionPopupReply
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** What an open popup sheet shows in place of its page, or the page itself. */
sealed interface ActionPopupPhase {
    data object Loading : ActionPopupPhase

    /** [retry] is false when asking again can't help (a config problem, an unknown format). */
    data class Failed(val message: String, val retry: Boolean) : ActionPopupPhase

    data class Shown(val content: ActionPopupContent) : ActionPopupPhase
}

/**
 * Where one open popup sheet stands (iOS `ActionPopupState`). [page] counts the loads
 * the web view must make; an answer that keeps the same page counts [pushes] instead,
 * and its new values reach the page without a reload.
 */
data class ActionPopupState(
    val phase: ActionPopupPhase = ActionPopupPhase.Loading,
    val page: Int = 0,
    val pushes: Int = 0,
    val inFlight: Boolean = false,
    /** The ask on its way was `fresh`: a stale answer to one that wasn't asks again. */
    val askedFresh: Boolean = false,
    /** The answer on its way loads the page anew even when it's the same (Refresh). */
    val reloadOnAnswer: Boolean = false,
    /** Why the last ask failed while a page stayed on show. */
    val refreshFailure: String? = null
) {
    val content: ActionPopupContent? get() = (phase as? ActionPopupPhase.Shown)?.content

    val canReload: Boolean get() = (phase as? ActionPopupPhase.Failed)?.retry != false

    /** The amber line under the page: why it couldn't be refreshed, else why its data failed. */
    val note: String?
        get() {
            val content = content ?: return null
            val failure = refreshFailure ?: content.refreshError.ifEmpty { null }
            return when {
                failure != null -> "Couldn't refresh: $failure"
                content.dataError.isNotEmpty() -> "Data: ${content.dataError}"
                else -> null
            }
        }

    /** The Mac's answer taken, and whether it was stale so a fresh one is due. */
    fun apply(reply: ActionPopupReply): Pair<ActionPopupState, Boolean> {
        val settled = copy(inFlight = false, reloadOnAnswer = false)
        val content = reply.content ?: return if (this.content != null) {
            settled.copy(refreshFailure = reply.error) to false
        } else {
            settled.copy(phase = ActionPopupPhase.Failed(reply.error, retry = true)) to false
        }
        val html = content.html
        if (html == null || content.error.isNotEmpty()) {
            val message = content.error.ifEmpty { ActionPopupCopy.COULD_NOT_OPEN }
            return settled.copy(
                phase = ActionPopupPhase.Failed(message, retry = true),
                refreshFailure = null
            ) to false
        }
        if (content.format != ActionPopupInfo.HTML) {
            return settled.copy(
                phase = ActionPopupPhase.Failed(ActionPopupCopy.NEWER_APP, retry = false),
                refreshFailure = null
            ) to false
        }
        val samePage = !reloadOnAnswer && this.content?.html == html
        return settled.copy(
            phase = ActionPopupPhase.Shown(content),
            page = if (samePage) page else page + 1,
            pushes = if (samePage) pushes + 1 else pushes,
            refreshFailure = null
        ) to (content.stale && !askedFresh)
    }

    /** No answer came: a sheet still loading says so; a page on show stays. */
    fun timedOut(): ActionPopupState {
        val settled = copy(inFlight = false, reloadOnAnswer = false)
        return when {
            phase == ActionPopupPhase.Loading -> settled.copy(
                phase = ActionPopupPhase.Failed(ActionPopupCopy.LATE_ANSWER, retry = true)
            )

            content != null -> settled.copy(refreshFailure = ActionPopupCopy.LATE_ANSWER)

            else -> settled
        }
    }
}

/** Every open popup sheet's state, by project and action. */
data class ActionPopupsState(val popups: Map<String, ActionPopupState> = emptyMap()) {
    fun popup(project: String, action: String): ActionPopupState =
        popups[popupKey(project, action)] ?: ActionPopupState()
}

/**
 * The action popups on screen (iOS `ActionPopupStore`): each sheet asks the Mac for
 * its page as it opens and every `refresh` seconds while it stays open, taking the
 * last result at once and a fresh one after a stale one; Refresh asks for a fresh one.
 */
class ActionPopupStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(ActionPopupsState())
    val state: StateFlow<ActionPopupsState> = mutable.asStateFlow()

    private val timers = GenerationTimeout<String>(session.scope)

    private val client: LpmClient? get() = session.client

    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.ACTION_POPUP_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onActionPopup = ::apply
    }

    override fun reset() {
        timers.cancelAll()
        mutable.value = ActionPopupsState()
    }

    /** The sheet opened: ask for the page, unless the config already says why there's none. */
    fun open(project: String, action: Action) {
        val info = action.popup ?: return
        val key = popupKey(project, action.name)
        when {
            info.problem.isNotEmpty() -> set(key, failed(info.problem))

            info.format != ActionPopupInfo.HTML -> set(key, failed(ActionPopupCopy.NEWER_APP))

            else -> {
                set(key, ActionPopupState())
                request(key, project, action.name, fresh = false)
            }
        }
    }

    /**
     * Refresh and Retry: run the commands again and load the page anew. A page on show
     * stays until the answer comes.
     */
    fun reload(project: String, action: String) {
        val key = popupKey(project, action)
        val popup = popups[key] ?: return
        if (!popup.canReload) return
        if (popup.content == null) change(key) { it.copy(phase = ActionPopupPhase.Loading) }
        request(key, project, action, fresh = true, reload = true)
    }

    /**
     * The refresh interval passed while the page is on screen: the Mac's last result,
     * and a fresh one after it when that was stale.
     */
    fun tick(project: String, action: String) {
        val key = popupKey(project, action)
        val popup = popups[key] ?: return
        if (popup.content == null || popup.inFlight) return
        request(key, project, action, fresh = false)
    }

    /** The page's renderer stopped (it crashed or the system reclaimed it). */
    fun pageFailed(project: String, action: String) {
        change(popupKey(project, action)) {
            it.copy(phase = ActionPopupPhase.Failed(ActionPopupCopy.STOPPED, retry = true))
        }
    }

    fun close(project: String, action: String) {
        val key = popupKey(project, action)
        mutable.update { it.copy(popups = it.popups - key) }
        timers.cancel(key)
    }

    fun apply(reply: ActionPopupReply) {
        val key = popupKey(reply.project, reply.action)
        val popup = popups[key] ?: return
        timers.cancel(key)
        val (next, stale) = popup.apply(reply)
        mutable.update { it.copy(popups = it.popups + (key to next)) }
        if (stale) request(key, reply.project, reply.action, fresh = true)
    }

    private val popups: Map<String, ActionPopupState> get() = mutable.value.popups

    private fun request(
        key: String,
        project: String,
        action: String,
        fresh: Boolean,
        reload: Boolean = false
    ) {
        change(key) {
            it.copy(
                inFlight = true,
                askedFresh = fresh,
                reloadOnAnswer = it.reloadOnAnswer || reload
            )
        }
        client?.requestActionPopup(project, action, fresh)
        timers.arm(key, TIMEOUT_MS) { change(key) { it.timedOut() } }
    }

    private fun set(key: String, popup: ActionPopupState) =
        mutable.update { it.copy(popups = it.popups + (key to popup)) }

    private fun change(key: String, transform: (ActionPopupState) -> ActionPopupState) =
        mutable.update { s ->
            val popup = s.popups[key] ?: return@update s
            s.copy(popups = s.popups + (key to transform(popup)))
        }

    private fun failed(message: String) =
        ActionPopupState(phase = ActionPopupPhase.Failed(message, retry = false))

    private companion object {
        const val TIMEOUT_MS = 20_000L
    }
}

private fun popupKey(project: String, action: String) = "$project\n$action"
