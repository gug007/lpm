package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.protocol.Inbound
import cx.lpm.mobile.core.protocol.Wire
import java.time.Instant

/** The socket's events, hopped to the main thread and ignored once it's replaced. */
internal class SocketEvents(private val client: LpmClient) : SocketListener {
    override fun onOpen(socket: Socket) = client.post {
        val frame = client.pendingHandshakeFrame
        if (socket !== client.socket || frame == null) return@post
        client.pendingHandshakeFrame = null
        client.transmit(frame, requeueOnFailure = false)
    }

    // Parsed on the transport's thread, dispatched in arrival order on main.
    override fun onMessage(socket: Socket, text: String) {
        val frame = Inbound.parse(text)
        client.post {
            if (socket !== client.socket) return@post
            if (frame is Inbound.Projects ||
                frame is Inbound.Sidebar
            ) {
                client.onListFrame?.invoke(text)
            }
            if (frame !is Inbound.Bye) client.noteStillThere()
            if (frame is Inbound.Pong) client.heartbeat.pong(socket)
            frame?.let(client::dispatch)
        }
    }

    override fun onFailure(socket: Socket, error: Throwable?) = client.post {
        if (socket === client.socket) client.transientFailure(error)
    }
}

/**
 * Handle one inbound frame on the main thread: the ones that drive the connection
 * itself here, every reply and push through [route] to its callback.
 */
internal fun LpmClient.dispatch(frame: Inbound) {
    when (frame) {
        is Inbound.Paired -> {
            hostFeatures = frame.features
            credential = LpmClient.Credential(frame.deviceId, frame.token)
            handshake.paired()
            cancelPairGuard()
            set(LpmClient.State.Ready)
            onConnected()
            flushPending()
            onPaired?.invoke(
                frame.deviceId,
                frame.token,
                frame.serverId,
                frame.serverName,
                frame.hosts,
                frame.platform
            )
            onBuild?.invoke(frame.build)
            onProjectsChanged?.invoke()
        }

        is Inbound.PairPending -> onPairPending?.invoke(frame.matchCode)

        is Inbound.PairDenied -> failPair(frame.reason, frame.message)

        is Inbound.Ready -> {
            hostFeatures = frame.features
            set(LpmClient.State.Ready)
            onConnected()
            // A new connection starts out counted as on screen.
            if (!inForeground) sendLive(Wire.presence(false))
            // Resume every terminal from where its screen got to, and re-watch git.
            streams.resumeAll()
            watchedProjects.forEach { sendLive(Wire.gitWatch(it)) }
            flushPending()
            onIdentity?.invoke(frame.serverId, frame.serverName, frame.platform)
            if (frame.hosts.isNotEmpty()) onAdvertisedHosts?.invoke(frame.serverId, frame.hosts)
            onWakeTargets?.invoke(frame.serverId, frame.wake)
            onBuild?.invoke(frame.build)
        }

        is Inbound.Bye -> {
            val at = frame.at?.let(Instant::ofEpochMilli) ?: env.clock.instant()
            farewellPending = true
            onFarewell?.invoke(frame.reason, at)
        }

        is Inbound.Error -> when (frame.message) {
            LpmClient.RELAY_OFFLINE_ERROR -> relayUnavailable()

            // The Mac dropped this device's record (or removed this phone outright):
            // retrying is pointless.
            "unauthorized" -> fatal(LpmClient.UNAUTHORIZED_ERROR)

            "revoked" -> fatal(LpmClient.REVOKED_ERROR)

            else -> fatal(frame.message)
        }

        is Inbound.Seed -> {
            streams.seeded(frame.id, frame.off)
            onControl?.invoke(frame.id, frame.owner)
            onSeed?.invoke(frame.id, frame.cols, frame.rows, frame.data, frame.reset)
            frame.draftText?.let {
                onComposerDraft?.invoke(frame.id, it, frame.draftRev, "mac", true)
            }
        }

        is Inbound.Output -> {
            if (streams.accept(
                    frame.id,
                    frame.data,
                    frame.off
                )
            ) {
                onOutput?.invoke(frame.id, frame.data)
            }
        }

        is Inbound.Exit -> {
            streams.ended(frame.id)
            onExit?.invoke(frame.id, frame.code, frame.gone)
        }

        Inbound.Pong -> Unit

        else -> route(frame)
    }
}

/** The Mac answered: note when, and drop a goodbye it said before. */
internal fun LpmClient.noteStillThere() {
    lastHeard = env.clock.instant()
    if (!farewellPending) return
    farewellPending = false
    onFarewellWithdrawn?.invoke()
}
