package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.model.AgentLaunch
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.protocol.Wire
import java.util.Base64
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Hands a share to its Mac over one short link of its own (iOS `ShareDelivery`): for
 * an agent, the images first (the Mac saves each and answers its path), then a new
 * tab whose first prompt is the note, the shared text and those paths; for notes, one
 * message in the project's most recent chat with the images attached.
 */
@Singleton
class ShareDelivery @Inject constructor(
    private val credentials: CredentialStore,
    private val clients: LpmClientFactory,
    private val prober: HostProber,
    device: ThisDevice
) {
    private val deviceName = device.name

    sealed interface Outcome {
        data object Sent : Outcome

        /** No address answered, or the link dropped: keep the share to send later. */
        data object Unreachable : Outcome

        /** The Mac answered and said no, in its own words. */
        data class Failed(val message: String) : Outcome
    }

    private sealed interface Opening {
        data class Open(val link: ShareLink) : Opening

        data object Unreachable : Opening

        data object Refused : Opening
    }

    suspend fun send(share: PendingShare, images: List<ByteArray>, mac: ShareMac): Outcome {
        // The share sheet may have started the process.
        if (!credentials.isLoaded) credentials.load()
        val credential = credentials.load(mac.localId)
            ?: return Outcome.Failed("Pair lpm Link with ${mac.name} again to share to it.")
        val link = when (val opening = open(mac, credential)) {
            is Opening.Open -> opening.link

            Opening.Unreachable -> return Outcome.Unreachable

            Opening.Refused -> return Outcome.Failed(
                "${mac.name} turned this phone away. Pair lpm Link with it again to share to it."
            )
        }
        return try {
            when (share.destination) {
                ShareDestination.Agent -> startAgent(share, images, link)
                ShareDestination.Notes -> addNote(share, images, link)
            }
        } finally {
            link.close()
        }
    }

    /** A signed-in link to the address of [mac]'s that answers. */
    private suspend fun open(mac: ShareMac, credential: LpmClient.Credential): Opening {
        val identity = HostProber.Identity(pin = credentials.loadPin(mac.localId))
        val host =
            prober.firstReachable(mac.hosts, mac.port, identity) ?: return Opening.Unreachable
        val link = ShareLink(
            clients.create(
                LpmClient.Endpoint(host, mac.port),
                credential,
                deviceName,
                pinProvider = { credentials.loadPin(mac.localId) }
            )
        )
        var signedIn = false
        try {
            link.connect()
            val reply = link.reply(SIGN_IN_MS) { it.string("t") in SIGN_IN_REPLIES }
            signedIn = reply?.string("t") == "ready"
            return when {
                signedIn -> Opening.Open(link)
                reply == null -> Opening.Unreachable
                else -> Opening.Refused
            }
        } finally {
            // Also when the sheet closes mid sign-in: a client left open keeps redialling.
            if (!signedIn) link.close()
        }
    }

    private suspend fun startAgent(
        share: PendingShare,
        images: List<ByteArray>,
        link: ShareLink
    ): Outcome {
        val paths = mutableListOf<String>()
        images.forEachIndexed { index, image ->
            val reqId = newReqId()
            link.send(Wire.upload(UPLOAD_ID, base64(image), JPEG, imageName(index), reqId))
            val reply = link.reply { it.string("t") == "upload" && it.string("reqId") == reqId }
                ?: return Outcome.Unreachable
            val path = reply.string("path")
            if (reply.bool("ok") != true || path == null) {
                return Outcome.Failed(reply.string("error") ?: "Couldn't send the image.")
            }
            paths += path
        }
        val launch = AgentLaunch(agent = share.agent, prompt = share.prompt(paths))
        link.send(Wire.newTerminal(share.project, launch))
        val reply = link.reply { it.string("t") == "newTerminal" } ?: return Outcome.Unreachable
        if (reply.bool("ok") == true) return Outcome.Sent
        return Outcome.Failed(reply.string("error") ?: "Couldn't open a new tab.")
    }

    private suspend fun addNote(
        share: PendingShare,
        images: List<ByteArray>,
        link: ShareLink
    ): Outcome {
        link.send(Wire.notesChats(share.project))
        val chats = link.reply {
            it.string("t") == "notesChats" && it.string("project") == share.project
        } ?: return Outcome.Unreachable
        val chat = chats.objects("chats")?.firstOrNull()?.string("id")
        if (chats.bool("ok") != true || chat == null) {
            return Outcome.Failed(chats.string("error") ?: "Couldn't open the project's notes.")
        }
        val attachments = images.mapIndexed { index, image ->
            buildJsonObject {
                put("name", imageName(index))
                put("mimeType", JPEG)
                put("data", base64(image))
            }
        }
        val reqId = newReqId()
        link.send(Wire.notesAddMessage(share.project, chat, share.noteText, attachments, reqId))
        val reply = link.reply {
            it.string("t") == "notesAddMessage" && it.string("reqId") == reqId
        } ?: return Outcome.Unreachable
        if (reply.bool("ok") == true) return Outcome.Sent
        return Outcome.Failed(reply.string("error") ?: "Couldn't add the note.")
    }

    private fun imageName(index: Int) = "shared-${index + 1}.jpg"

    private fun base64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

    private fun newReqId() = UUID.randomUUID().toString().uppercase()

    private companion object {
        const val UPLOAD_ID = "share"
        const val JPEG = "image/jpeg"
        const val SIGN_IN_MS = 6_000L
        val SIGN_IN_REPLIES = setOf("ready", "error")
    }
}
