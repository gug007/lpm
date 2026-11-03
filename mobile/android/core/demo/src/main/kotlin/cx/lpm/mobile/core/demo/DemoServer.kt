package cx.lpm.mobile.core.demo

import java.time.Clock
import kotlin.time.DurationUnit
import kotlin.time.toDuration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The in-process fake Mac hub behind Demo Mode. It parses the frames the client would
 * have sent over the socket, dispatches each to a per-domain handler, and pushes
 * protocol-correct replies back through [deliver]. A protocol-faithful miniature of
 * the real desktop hub, so every store, reqId match, and stale-reply guard in the app
 * runs unchanged.
 *
 * Single-threaded: call [receive] on [scope]'s dispatcher (Main in the app); scripted
 * pushes are coroutines on the same scope. Seed dates and calendar math follow
 * [clock] and its zone.
 */
class DemoServer(
    internal val scope: CoroutineScope,
    internal val clock: Clock = Clock.systemDefaultZone()
) {
    /** Delivers a reply frame into the client's inbound path. */
    var deliver: ((String) -> Unit)? = null

    /** All mutable demo state (see [DemoWorld]). */
    internal val world = DemoWorld(clock)

    private val handlers = mutableMapOf<String, (Dict) -> Unit>()

    internal val verbs: Set<String> get() = handlers.keys

    init {
        registerProjectsHandlers()
        registerTerminalsHandlers()
        registerTabMenuHandlers()
        registerGitHandlers()
        registerGitDiscardHandlers()
        registerGitHistoryHandlers()
        registerGitChecksHandlers()
        registerGitAutoHandlers()
        registerAutoPullHandlers()
        registerClaudeAccountHandlers()
        registerStatsHandlers()
        registerRecapHandlers()
        registerJobsHandlers()
        registerConfigHandlers()
        registerMemoryHandlers()
        registerCommandsHandlers()
        registerNotesHandlers()
        registerLimitsHandlers()
        registerKeepAwakeHandlers()
        registerUploadHandlers()
    }

    /** Register a handler for an outbound verb (`t`). */
    internal fun register(t: String, handler: (Dict) -> Unit) {
        handlers[t] = handler
    }

    /** Parse one outbound frame and route it to its handler. Unknown verbs no-op. */
    fun receive(text: String) {
        val obj = parseDict(text) ?: return
        val t = obj.string("t") ?: return
        handlers[t]?.invoke(obj)
    }

    /** JSON-encode and deliver a reply frame now. */
    internal fun push(obj: Dict) {
        deliver?.invoke(encodeJson(obj))
    }

    /** Deliver a reply frame after a simulated delay. */
    internal fun pushAfter(seconds: Double, obj: Dict) {
        after(seconds) { push(obj) }
    }

    /**
     * Deliver a reply frame built lazily after a delay, so it can reflect state at fire
     * time. A null result cancels the push.
     */
    internal fun pushAfter(seconds: Double, make: () -> Dict?) {
        after(seconds) { make()?.let(::push) }
    }

    /**
     * Run [block] after [seconds], like `DispatchQueue.main.asyncAfter`: the timer starts
     * now, so timers set in one turn fire in the order they were set.
     */
    internal fun after(seconds: Double, block: () -> Unit) {
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            delay(seconds.toDuration(DurationUnit.SECONDS))
            block()
        }
    }

    internal fun nowMillis(): Long = clock.millis()

    internal fun nowSeconds(): Long = clock.millis() / 1000

    /** `Date().timeIntervalSince1970`. */
    internal fun nowInterval(): Double = clock.millis() / 1000.0

    companion object {
        const val SERVER_ID = "demo-mac"
        const val SERVER_NAME = "Demo Mac"
        const val DEVICE_ID = "demo-device"
    }
}
