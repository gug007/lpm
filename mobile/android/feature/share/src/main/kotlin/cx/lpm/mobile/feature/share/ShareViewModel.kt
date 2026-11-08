package cx.lpm.mobile.feature.share

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.share.ShareChoices
import cx.lpm.mobile.core.data.share.ShareDelivery
import cx.lpm.mobile.core.data.share.ShareDirectoryStore
import cx.lpm.mobile.core.data.share.ShareInbox
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareDirectory
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject
import cx.lpm.mobile.core.model.trimmingWhitespace
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import java.time.Clock
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Where the sheet's send stands. */
sealed interface SharePhase {
    data object Loading : SharePhase

    data object Ready : SharePhase

    data object Sending : SharePhase

    data object Sent : SharePhase

    /** No address answered: the share waits on the phone for the app to send. */
    data object Queued : SharePhase

    data class Failed(val message: String) : SharePhase

    /** No address answered, and the share couldn't be kept either. */
    data object NotKept : SharePhase
}

data class ShareUiState(
    /** Null until it's read from disk. */
    val directory: ShareDirectory? = null,
    val items: SharedItems = SharedItems(),
    val phase: SharePhase = SharePhase.Loading,
    val note: String = "",
    val macId: String = "",
    val project: String = "",
    val destination: ShareDestination = ShareDestination.Agent,
    val agent: String = ""
) {
    val macs: List<ShareMac> get() = directory?.macs.orEmpty()
    val mac: ShareMac? get() = macs.firstOrNull { it.serverId == macId }
    val projects: List<ShareProject> get() = mac?.projects.orEmpty()
    val agents: List<ShareAgent> get() = mac?.agents.orEmpty()
    val selectedProject: ShareProject? get() = projects.firstOrNull { it.name == project }
    val selectedAgent: ShareAgent? get() = agents.firstOrNull { it.id == agent }
    val projectTitle: String get() = selectedProject?.title ?: project

    val canSend: Boolean
        get() = phase == SharePhase.Ready && mac != null && selectedProject != null &&
            (destination == ShareDestination.Notes || selectedAgent != null) &&
            !(items.isEmpty && note.trimmingWhitespace().isEmpty())
}

/**
 * The share sheet (iOS `ShareModel`): it starts with the last share's Mac, project and
 * destination, and sends straight to the Mac; when no address answers, the share waits
 * on the phone for the app to send.
 */
@HiltViewModel
class ShareViewModel @Inject constructor(
    private val directories: ShareDirectoryStore,
    private val choices: ShareChoices,
    private val delivery: ShareDelivery,
    private val inbox: ShareInbox,
    private val images: ShareImages,
    private val clock: Clock
) : ViewModel() {
    private val mutable = MutableStateFlow(ShareUiState())
    val uiState: StateFlow<ShareUiState> = mutable.asStateFlow()
    private var started = false

    /** Read the directory, then what was shared; a recreated screen keeps what it read. */
    fun start(input: SharedInput) {
        if (started) return
        started = true
        viewModelScope.launch {
            choices.load()
            val directory = directories.load()
            val macs = directory.macs
            val mac = (macs.firstOrNull { it.serverId == choices.mac } ?: macs.firstOrNull())
            mutable.update {
                pickDefaults(it.copy(directory = directory, macId = mac?.serverId.orEmpty()))
            }
            val items = read(input)
            mutable.update { it.copy(items = items, phase = SharePhase.Ready) }
        }
    }

    fun setNote(note: String) = mutable.update { it.copy(note = note) }

    fun selectMac(serverId: String) {
        if (serverId == uiState.value.macId) return
        mutable.update { pickDefaults(it.copy(macId = serverId)) }
    }

    fun setProject(project: String) = mutable.update { it.copy(project = project) }

    fun setDestination(destination: ShareDestination) =
        mutable.update { it.copy(destination = destination) }

    fun setAgent(agent: String) = mutable.update { it.copy(agent = agent) }

    fun send() {
        val state = uiState.value
        val mac = state.mac
        if (!state.canSend || mac == null) return
        mutable.update { it.copy(phase = SharePhase.Sending) }
        remember(state)
        val agentTab = state.destination == ShareDestination.Agent
        val share = PendingShare(
            id = UUID.randomUUID().toString().uppercase(),
            serverId = mac.serverId,
            macName = mac.name,
            project = state.project,
            projectTitle = state.projectTitle,
            destination = state.destination,
            agent = if (agentTab) state.agent else "",
            note = state.note,
            text = state.items.text,
            createdAt = clock.millis()
        )
        val jpegs = state.items.images
        viewModelScope.launch {
            val phase = when (val outcome = delivery.send(share, jpegs, mac)) {
                ShareDelivery.Outcome.Sent -> SharePhase.Sent

                ShareDelivery.Outcome.Unreachable -> try {
                    inbox.save(share, jpegs)
                    SharePhase.Queued
                } catch (e: IOException) {
                    SharePhase.NotKept
                }

                is ShareDelivery.Outcome.Failed -> SharePhase.Failed(outcome.message)
            }
            mutable.update { it.copy(phase = phase) }
        }
    }

    fun dismissFailure() = mutable.update {
        if (it.phase is SharePhase.Failed || it.phase == SharePhase.NotKept) {
            it.copy(phase = SharePhase.Ready)
        } else {
            it
        }
    }

    private suspend fun read(input: SharedInput): SharedItems {
        val jpegs = mutableListOf<ByteArray>()
        for (stream in input.streams) {
            if (jpegs.size == SharedItems.MAX_IMAGES) break
            images.encode(stream)?.let { jpegs += it }
        }
        var items = SharedItems(
            images = jpegs,
            thumbnail = jpegs.firstOrNull()?.let { images.thumbnail(it) },
            title = input.title?.takeIf(String::isNotEmpty)
        )
        input.texts.forEach { items = items.adding(it) }
        return items
    }

    /** The Mac's project, agent and destination as the last share left them, where it has them. */
    private fun pickDefaults(state: ShareUiState): ShareUiState {
        val projects = state.projects
        val agents = state.agents
        val savedDestination = ShareDestination.of(choices.destination)
        return state.copy(
            project = (
                projects.firstOrNull {
                    it.name == choices.project
                } ?: projects.firstOrNull()
                )
                ?.name.orEmpty(),
            agent = (agents.firstOrNull { it.id == choices.agent } ?: agents.firstOrNull())
                ?.id.orEmpty(),
            destination = if (agents.isEmpty()) {
                ShareDestination.Notes
            } else {
                savedDestination ?: ShareDestination.Agent
            }
        )
    }

    private fun remember(state: ShareUiState) {
        choices.mac = state.macId
        choices.project = state.project
        choices.destination = state.destination.rawValue
        if (state.destination == ShareDestination.Agent) choices.agent = state.agent
    }
}
