package cx.lpm.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * What the share sheet offers (iOS `ShareDirectory`): each paired Mac this phone
 * reaches directly, with where to reach it, its local projects and the agents a new
 * tab can start. The app writes it as it learns each Mac's projects, so the sheet
 * lists them without a live link. Nothing secret: credentials stay in their store.
 */
@Serializable
data class ShareDirectory(val macs: List<ShareMac> = emptyList()) {
    /** The directory with [mac] as it is now first, the Macs no longer saved dropped. */
    fun updating(mac: ShareMac?, keeping: Set<String>): ShareDirectory {
        val others = macs.filter { it.serverId in keeping && it.serverId != mac?.serverId }
        return ShareDirectory(listOfNotNull(mac) + others)
    }
}

@Serializable
data class ShareMac(
    /** The saved record's local id, which keys its credential and pin. */
    val localId: String,
    val serverId: String,
    val name: String,
    val hosts: List<String>,
    val port: Int,
    val projects: List<ShareProject> = emptyList(),
    /** Empty on a Mac that can't start agents from a phone. */
    val agents: List<ShareAgent> = emptyList()
)

@Serializable
data class ShareProject(val name: String, val label: String) {
    val title: String get() = label.ifEmpty { name }
}

@Serializable
data class ShareAgent(val id: String, val label: String)

/** Where a share goes: a new agent tab whose first prompt it is, or the project's notes. */
@Serializable
enum class ShareDestination {
    @SerialName("agent")
    Agent,

    @SerialName("notes")
    Notes;

    /** Its name as iOS keeps it, which is also its serial name. */
    val rawValue: String get() = name.lowercase()

    companion object {
        fun of(raw: String?): ShareDestination? = entries.firstOrNull { it.rawValue == raw }
    }
}

/**
 * One share on its way to a Mac (iOS `PendingShare`): what was shared, the note it
 * came with, and where it goes.
 */
@Serializable
data class PendingShare(
    val id: String,
    val serverId: String,
    val macName: String,
    val project: String,
    val projectTitle: String,
    val destination: ShareDestination,
    /** The agent a new tab starts, for [ShareDestination.Agent]. */
    val agent: String,
    val note: String,
    /** The shared text and links, a paragraph each. */
    val text: String,
    /** Milliseconds since the epoch, which orders the shares kept for later. */
    val createdAt: Long
) {
    /** What the agent is asked, with the shared images' paths on the Mac after it. */
    fun prompt(imagePaths: List<String>): String =
        paragraphs(listOf(note, text, imagePaths.joinToString(" ")))

    /** The note's text in the project's notebook; images ride as attachments. */
    val noteText: String get() = paragraphs(listOf(note, text))

    companion object {
        fun paragraphs(parts: List<String>): String =
            parts.map(String::trimmingWhitespace).filter(String::isNotEmpty).joinToString("\n\n")
    }
}
