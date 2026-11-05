package cx.lpm.mobile.core.data.agents

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.pickAgentDialog
import cx.lpm.mobile.core.data.client.requestAgentDialog
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.next
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** The dialogs waiting agents show, and the picks made from them, by terminal id. */
data class AgentDialogState(
    /** What each terminal's waiting report shows. */
    val reads: Map<String, AgentDialogRead> = emptyMap(),
    /** The option on its way to the Mac. */
    val picking: Map<String, String> = emptyMap(),
    /** Why the last pick didn't land. */
    val errors: Map<String, String> = emptyMap(),
    /** The dialog a pick that reached the Mac answered, until the agent moves on. */
    val answered: Map<String, String> = emptyMap(),
    /** A warning to feel each time the Mac turns a pick down. */
    val feedback: HapticCue? = null
) {
    /** The dialog to show for a waiting agent's row, once the Mac has read one. */
    fun read(terminal: String, key: String): AgentDialogRead? =
        reads[terminal]?.takeIf { it.key == key && it.dialog != null }

    /** Whether a pick of this dialog went through and the agent hasn't moved on yet. */
    fun isAnswered(read: AgentDialogRead): Boolean {
        val id = read.dialog?.id ?: return false
        return answered[read.terminalId] == id
    }
}

/**
 * The dialogs agents wait on (iOS `AgentDialogStore`): asked for while a waiting
 * agent's row is on screen, and answered from it with one of their options — the
 * desktop sidebar's question card (SidebarAgentAsk.tsx).
 */
class AgentDialogStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(AgentDialogState())
    val state: StateFlow<AgentDialogState> = mutable.asStateFlow()

    private val timers = GenerationTimeout<String>(session.scope)

    /** Picks sent, by request id. */
    private val sent = mutableMapOf<String, Pick>()

    private data class Pick(val terminal: String, val dialog: String)

    private val client: LpmClient? get() = session.client

    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.AGENT_DIALOG_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onAgentDialog = ::apply
        client.onAgentDialogAnswer = ::applyAnswer
    }

    override fun reset() {
        timers.cancelAll()
        sent.clear()
        mutable.value = AgentDialogState()
    }

    /**
     * Asks for the dialog while the agent waits and its row is on screen. A CLI can
     * draw it a moment after its hook reports the wait, so a read with no dialog is
     * tried again a few times.
     */
    suspend fun follow(project: String, terminal: String, key: String) {
        if (!available) return
        for (seconds in FOLLOW_DELAYS_S) {
            client?.requestAgentDialog(project, terminal)
            delay(seconds * 1_000)
            if (state.value.read(terminal, key) != null) return
        }
    }

    /** A read from the Mac: a dialog that changed or went away drops what was said of the last. */
    fun apply(read: AgentDialogRead) {
        val terminal = read.terminalId
        if (terminal.isEmpty()) return
        mutable.update { s ->
            val shown = s.answered[terminal]
            val movedOn = shown != null && (read.key.isEmpty() || read.dialog?.id != shown)
            val changed = s.reads[terminal]?.dialog?.id != read.dialog?.id
            s.copy(
                reads = s.reads + (terminal to read),
                answered = if (movedOn) s.answered - terminal else s.answered,
                errors = if (changed) s.errors - terminal else s.errors
            )
        }
    }

    fun pick(option: AgentDialogOption, read: AgentDialogRead) {
        val dialog = read.dialog ?: return
        val terminal = read.terminalId
        if (terminal in state.value.picking) return
        val client = client ?: return
        val reqId = UUID.randomUUID().toString()
        sent[reqId] = Pick(terminal, dialog.id)
        mutable.update {
            it.copy(picking = it.picking + (terminal to option.key), errors = it.errors - terminal)
        }
        client.pickAgentDialog(read, option.key, reqId)
        timers.arm(reqId, PICK_TIMEOUT_MS) {
            if (sent.remove(reqId) == null) return@arm
            mutable.update {
                it.copy(
                    picking = it.picking - terminal,
                    errors = it.errors + (terminal to "Couldn't reach your Mac. Try again.")
                )
            }
        }
    }

    /** The Mac's word on a pick. False when [reqId] isn't one of this store's. */
    fun applyAnswer(reqId: String, error: String?): Boolean {
        val pick = sent.remove(reqId) ?: return false
        timers.cancel(reqId)
        val terminal = pick.terminal
        if (error != null) {
            mutable.update {
                it.copy(
                    picking = it.picking - terminal,
                    errors = it.errors + (terminal to error),
                    feedback = it.feedback.next(Haptic.Error)
                )
            }
            refresh(terminal)
            return true
        }
        mutable.update {
            it.copy(
                picking = it.picking - terminal,
                answered = it.answered + (terminal to pick.dialog)
            )
        }
        timers.arm("$reqId/refresh", NO_EFFECT_MS) { refresh(terminal) }
        timers.arm("$reqId/check", NO_EFFECT_MS + RECHECK_MS) {
            val s = state.value
            val stillShown = s.reads[terminal]?.dialog?.id == pick.dialog
            if (s.answered[terminal] != pick.dialog || !stillShown) return@arm
            mutable.update {
                it.copy(
                    answered = it.answered - terminal,
                    errors = it.errors + (terminal to NO_EFFECT_ERROR)
                )
            }
        }
        return true
    }

    private fun refresh(terminal: String) {
        val read = state.value.reads[terminal] ?: return
        client?.requestAgentDialog(read.project, terminal)
    }

    private companion object {
        val FOLLOW_DELAYS_S = listOf(1L, 2L, 4L, 8L, 15L)
        const val PICK_TIMEOUT_MS = 10_000L

        // How long a pick that reached the Mac may leave its dialog on screen before the
        // card says it didn't get through (the desktop's NO_EFFECT_MS).
        const val NO_EFFECT_MS = 2_500L
        const val RECHECK_MS = 1_500L
        const val NO_EFFECT_ERROR = "The answer didn't reach the agent. Open the tab to check."
    }
}
