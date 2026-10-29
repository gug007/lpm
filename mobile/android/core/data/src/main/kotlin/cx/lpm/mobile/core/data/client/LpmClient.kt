package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.demo.DemoServer
import cx.lpm.mobile.core.protocol.Inbound
import cx.lpm.mobile.core.protocol.Wire
import java.time.Instant
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * A single WebSocket connection to a paired Mac. Owns connect/auth/reconnect and
 * demultiplexes inbound frames to per-terminal streams and control state (frame
 * handling in LpmClientInbound.kt, the Demo Mode path in LpmClientDemo.kt).
 *
 * Android stops the app's network seconds to minutes after backgrounding, so
 * [connect] is idempotent and safe to call again on foreground; each connect
 * re-authenticates and re-subscribes, and the server's `seed` frame restores the
 * current screen. Everything here runs on the main thread; callbacks too.
 */
class LpmClient internal constructor(
    endpoint: Endpoint,
    credential: Credential?,
    deviceName: String,
    internal val env: ClientEnvironment,
    private val trust: PinningTrustManager,
    internal val demoServer: DemoServer?,
    // The machine the Mac carries this connection to, for one opened through it.
    relaySlug: String?
) : LpmClientCallbacks() {
    sealed interface State {
        data object Idle : State

        data object Connecting : State

        data object Ready : State

        data class Failed(val message: String) : State
    }

    data class Endpoint(val host: String, val port: Int)

    data class Credential(val deviceId: String, val token: String)

    private var endpoint = endpoint
    internal var credential = credential
    internal val handshake = Handshake(deviceName, relaySlug, env.phoneId)
    private var pairGuard: Job? = null
    internal var socket: Socket? = null
    internal val streams = TerminalStreams { sendLive(it) }
    internal val watchedProjects = linkedSetOf<String>()

    var state: State = State.Idle
        private set

    /** The last frame or heartbeat reply from the Mac. */
    var lastHeard: Instant? = null
        internal set

    /** What the Mac said it answers in its `paired`/`ready` frame. */
    var hostFeatures: Set<String> = emptySet()
        internal set

    internal val pendingSends = PendingSends { onSendQueueFull?.invoke() }

    // `wantConnected` is true between connect() and disconnect() and gates every
    // retry, so an intentional teardown never resurrects the socket.
    internal var wantConnected = false
    private val backoff = Backoff(env.scope, env.random)
    private var connectWatchdog: Job? = null
    internal val heartbeat = Heartbeat(
        scope = env.scope,
        clock = env.clock,
        current = { socket },
        fail = { error -> transientFailure(error) },
        alive = { noteStillThere() }
    )

    // What the most recent transport failure looked like, reported once retries
    // stop being patient.
    private var failureHint = OFFLINE_HINT

    // Through Built-in Tailscale's loopback bridge an unreachable Mac surfaces as a
    // failed TLS handshake, not as an unreachable host.
    private var dialedThroughTailnet = false

    /** The cause chain of the last transport failure (e.g. "SSLHandshakeException/…"). */
    var lastTransportErrorChain: String? = null
        private set

    internal var farewellPending = false

    // The auth/pair frame for this attempt, sent once the socket reports open: a
    // send during a slow TLS handshake can fail and kill a connection about to work.
    internal var pendingHandshakeFrame: String? = null

    /** This device's id once paired/authenticated, for comparing control owners. */
    val deviceId: String? get() = credential?.deviceId

    /** The leaf-cert fingerprint of this connection's handshake, to pin after auth. */
    val observedFingerprint: String? get() = trust.observed

    /** The address this client dials. */
    val host: String get() = endpoint.host

    /** A [verifyNow] probe is still out: the link may already be dead. */
    val isVerifying: Boolean get() = heartbeat.isProbing

    /**
     * Whether the app is on screen. The Mac skips agent notifications for a phone
     * with a live link, so tell it when this one is away.
     */
    var inForeground: Boolean = true
        set(value) {
            val changed = value != field
            field = value
            if (changed) sendLive(Wire.presence(value))
        }

    init {
        trust.onMismatch = { pairing -> notePinMismatch(pairing) }
        demoServer?.deliver = { text -> injectInbound(text) }
    }

    /** Feed a server frame into the normal inbound path (Demo Mode). */
    fun injectInbound(text: String) {
        val frame = Inbound.parse(text)
        post {
            // Like frames from a torn-down socket, nothing reaches a disconnected link.
            if (demoServer != null && !wantConnected) return@post
            frame?.let(::dispatch)
        }
    }

    /**
     * A certificate pin check failed during the TLS handshake: a terminal failure
     * (no silent retry onto a possibly-impersonated Mac).
     */
    private fun notePinMismatch(pairing: Boolean) {
        post { fatal(if (pairing) PAIR_MISMATCH_ERROR else IDENTITY_CHANGED_ERROR) }
    }

    /** Connect (or reconnect) a paired session: resets backoff, starts fresh. */
    fun connect() {
        if (demoServer != null) return connectDemo()
        wantConnected = true
        cancelReconnect()
        startAttempt()
    }

    /** Consume a one-time pairing code; `replaces` names a record the Mac retires. */
    fun pair(host: String, port: Int, code: String, replaces: String? = null) {
        endpoint = Endpoint(host, port)
        handshake.pairWithCode(code, replaces)
        connect()
    }

    /** Approve-on-Mac pairing: send a `pairRequest` and wait for the user's Allow. */
    fun pairRequest(host: String, port: Int, replaces: String? = null) {
        endpoint = Endpoint(host, port)
        handshake.requestApproval(replaces)
        connect()
    }

    /** Force an immediate attempt (the "Retry" button), skipping any backoff. */
    fun retryNow() {
        cancelReconnect()
        wantConnected = true
        startAttempt()
    }

    /** Dial another saved address of the same Mac, keeping every subscription. */
    fun move(host: String) {
        endpoint = Endpoint(host, endpoint.port)
        retryNow()
    }

    /**
     * Foreground probe: `Ready` after the app was backgrounded is often stale, so
     * ping now with a short deadline and hand a failure to the reconnect loop.
     */
    fun verifyNow() {
        if (demoServer != null || state != State.Ready) return
        heartbeat.probe()
    }

    fun disconnect() {
        wantConnected = false
        handshake.endApproval()
        cancelPairGuard()
        cancelReconnect()
        teardownSocket()
        pendingSends.clear()
        set(State.Idle)
    }

    /** Retire a throwaway client (e.g. a per-Mac push registration) for good. */
    fun shutdown() = disconnect()

    private fun startAttempt() {
        // An address that can't form a URL fails like any unreachable candidate, so
        // the session's repick tries the others; during approve-on-Mac pairing there
        // are no others, so name it for what it is.
        val (dialHost, dialPort) = env.tailnet.route(endpoint.host, endpoint.port)
        val url = WssUrl.make(dialHost, dialPort)
        if (url == null) {
            if (handshake.approving) return failPair(BAD_ADDRESS_REASON)
            return transientFailure()
        }
        dialedThroughTailnet = dialHost != endpoint.host && dialHost == "127.0.0.1"
        teardownSocket()
        set(State.Connecting)
        pendingHandshakeFrame = handshake.frame(credential) ?: return fatal(NO_CREDENTIAL_ERROR)
        socket = env.transport.open(url, trust, SocketEvents(this))
        if (handshake.approving) armPairGuard() else startWatchdog()
    }

    // Bound an approve-on-Mac pairing so a silent Mac can't hang the UI.
    private fun armPairGuard() {
        pairGuard?.cancel()
        pairGuard = after(PAIR_GUARD_MS) {
            if (handshake.approving) failPair("timeout")
        }
    }

    internal fun cancelPairGuard() {
        pairGuard?.cancel()
        pairGuard = null
    }

    internal fun failPair(reason: String, message: String? = null) {
        handshake.endApproval()
        cancelPairGuard()
        wantConnected = false
        cancelReconnect()
        teardownSocket()
        pendingSends.clear()
        set(State.Idle)
        onPairDenied?.invoke(reason, message)
    }

    internal fun onConnected() {
        backoff.reset()
        failureHint = OFFLINE_HINT
        connectWatchdog?.cancel()
        connectWatchdog = null
        if (demoServer == null) heartbeat.start()
    }

    /**
     * A retryable failure: tear down and back off (unless intentionally
     * disconnected), keeping the error's shape for the eventual offline message.
     */
    internal fun transientFailure(error: Throwable? = null) {
        failureHint = if (dialedThroughTailnet) OFFLINE_HINT else TransportErrors.classify(error)
        lastTransportErrorChain = TransportErrors.chain(error)
        // A dropped socket during approve-on-Mac pairing must not retry (a retry
        // pops a fresh Allow dialog); surface it as a no-answer timeout instead.
        if (handshake.approving) return failPair("timeout")
        teardownSocket()
        if (wantConnected) scheduleReconnect()
    }

    // The Mac answered but can't reach the machine this connection goes on to.
    internal fun relayUnavailable() {
        failureHint = RELAY_OFFLINE_ERROR
        lastTransportErrorChain = null
        teardownSocket()
        if (wantConnected) scheduleReconnect()
    }

    /** A terminal failure: stop retrying; the user must act (re-pair, fix the address). */
    internal fun fatal(message: String) {
        wantConnected = false
        cancelReconnect()
        teardownSocket()
        pendingSends.clear()
        set(State.Failed(message))
    }

    private fun scheduleReconnect() {
        if (!wantConnected) return
        val showing = backoff.schedule(failureHint) { if (wantConnected) startAttempt() } ?: return
        set(showing)
    }

    private fun startWatchdog() {
        connectWatchdog?.cancel()
        connectWatchdog = after(CONNECT_TIMEOUT_MS) {
            if (wantConnected && state != State.Ready) transientFailure()
        }
    }

    private fun cancelReconnect() = backoff.cancel()

    private fun teardownSocket() {
        connectWatchdog?.cancel()
        connectWatchdog = null
        heartbeat.stop()
        pendingHandshakeFrame = null
        socket?.close()
        socket = null
    }

    // MARK: terminal streams

    /** Subscribe with an empty emulator: the Mac replays the current screen. */
    fun subscribe(id: String) = streams.subscribe(id)

    /**
     * Catch a terminal already on screen back up without disturbing what it shows;
     * the Mac replays the screen when it no longer holds the missed slice. A request
     * in flight already covers this, and one dropped on a dead link is covered by
     * the re-subscribe on the next `ready`.
     */
    fun resync(id: String) = streams.resync(id)

    fun unsubscribe(id: String) = streams.unsubscribe(id)

    fun watchGit(project: String) {
        watchedProjects += project
        sendLive(Wire.gitWatch(project))
    }

    fun unwatchGit(project: String) {
        watchedProjects -= project
        sendLive(Wire.gitUnwatch(project))
    }

    internal fun set(s: State) {
        state = s
        onState?.invoke(s)
    }

    // Like `DispatchQueue.main.async`: always runs later, never inline.
    internal fun post(block: () -> Unit) {
        env.scope.launch { block() }
    }

    private fun after(millis: Long, block: () -> Unit): Job = env.scope.launch {
        delay(millis)
        block()
    }

    companion object {
        const val SERVICE_LOGS_WATCH_FEATURE = "serviceLogsWatch"
        const val FILE_UPLOAD_FEATURE = "fileUpload"

        // `restartService` / `stopService`, and ended services reported as `exited`.
        const val SERVICE_RESTART_FEATURE = "serviceRestart"

        // `restartTerminal`: an ended terminal run again in its tab.
        const val RESTART_TERMINAL_FEATURE = "restartTerminal"

        // `agentOptions` and `newTerminal` starting an agent; `agentSessions` and
        // `resumeSession`; `runAction` with a `prompt`; `listDir` for Files.
        const val AGENT_LAUNCH_FEATURE = "agentLaunch"
        const val AGENT_SESSIONS_FEATURE = "agentSessions"
        const val ACTION_PROMPT_FEATURE = "actionPrompt"
        const val LIST_DIR_FEATURE = "listDir"

        // The tab menu's `forkTerminal`, `forkTerminalCopy`, `titleTerminal` and
        // `closeOtherTerminals`.
        const val TAB_MENU_FEATURE = "tabMenu"

        // `answerAgent` from a notification's buttons, and `liveActivity` updates.
        const val ANSWER_AGENT_FEATURE = "answerAgent"
        const val LIVE_ACTIVITY_FEATURE = "liveActivity"

        // `weeklyRecap`: the desktop's weekly recap card.
        const val WEEKLY_RECAP_FEATURE = "weeklyRecap"

        // `weeklyRecap` with `period: "month"`.
        const val RECAP_MONTH_FEATURE = "recapMonth"

        // Seen agents, `archiveStatus`, `markStatusSeen` and `markStatusUnread`.
        const val AGENT_ARCHIVE_FEATURE = "agentArchive"

        // `limitReminders`, `setLimitReminder` and `clearLimitReminder`.
        const val LIMIT_REMINDERS_FEATURE = "limitReminders"

        // `wake`: waking another paired machine.
        const val WAKE_FEATURE = "wake"

        const val OFFLINE_HINT =
            "Can't reach your Mac. On cellular, make sure Tailscale is connected on both devices."

        // Certificate-pin aborts: a reconnect whose cert no longer matches the pin,
        // and a QR pairing whose cert didn't match the QR's fingerprint.
        const val IDENTITY_CHANGED_ERROR = "identity-changed"
        const val PAIR_MISMATCH_ERROR = "pair-mismatch"

        // Retryable failures where the Mac did answer: the secure handshake failed,
        // or nothing accepts on the port (lpm not running, or a stale port).
        const val SECURE_FAILED_ERROR = "secure-failed"
        const val REFUSED_ERROR = "connection-refused"

        // An address the phone can't form a URL from (approve-on-Mac pairing only).
        const val BAD_ADDRESS_REASON = "bad-address"

        // The Mac no longer holds a paired record for this phone.
        const val UNAUTHORIZED_ERROR = "device-unauthorized"

        // A Mac that removed this phone, answering a pairing code another Mac armed
        // for it or a connection carried through another Mac. Only pairing on that
        // Mac itself lets the phone back in.
        const val REVOKED_ERROR = "device-revoked"

        const val PAIRING_REJECTED_ERROR = "pairing rejected"
        const val PAIRING_UNAVAILABLE_ERROR = "pairing unavailable"
        const val NO_CREDENTIAL_ERROR = "no credential"

        // Through the Mac to one of its machines: not connected right now, or too old.
        const val RELAY_OFFLINE_ERROR = "relay-offline"
        const val RELAY_UNSUPPORTED_ERROR = "relay-unsupported"

        /** Any retryable "offline" hint — what stale-host repick and recovery react to. */
        fun isOfflineHint(message: String): Boolean =
            message == OFFLINE_HINT || message == SECURE_FAILED_ERROR || message == REFUSED_ERROR

        private const val PAIR_GUARD_MS = 35_000L
        private const val CONNECT_TIMEOUT_MS = 10_000L
    }
}
