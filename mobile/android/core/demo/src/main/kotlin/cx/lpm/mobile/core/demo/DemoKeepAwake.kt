package cx.lpm.mobile.core.demo

private val KEEP_AWAKE_MODES = setOf("off", "agents", "timed", "always")
private const val KEEP_AWAKE_AGENTS = 2
private val KEEP_AWAKE_MINUTES = 1..5999
private const val KEEP_AWAKE_TIME_ERROR = "Pick a time between 1 minute and 99 hours 59 minutes."

/**
 * Demo handlers for Keep awake: the demo Mac starts kept awake while two of its agents
 * work, and takes every change the menus make (iOS `DemoKeepAwake.swift`).
 */
internal fun DemoServer.registerKeepAwakeHandlers() {
    register("keepAwake") { pushKeepAwake() }
    register("keepAwakeSet") { o ->
        val mode = o.string("mode").orEmpty()
        val minutes = o.int("minutes") ?: 0
        val error = if (mode == "extend") extendKeepAwake(minutes) else setKeepAwake(mode, minutes)
        pushAfter(0.2) {
            buildMap {
                put("t", "keepAwakeSet")
                put("ok", error == null)
                put("state", keepAwakeState())
                if (error != null) put("error", error)
            }
        }
        if (error == null) pushKeepAwake()
    }
}

private fun DemoServer.setKeepAwake(mode: String, minutes: Int): String? {
    if (mode !in KEEP_AWAKE_MODES) return "Unknown Keep awake mode \"$mode\"."
    if (mode == "timed" && minutes !in KEEP_AWAKE_MINUTES) return KEEP_AWAKE_TIME_ERROR
    world.keepAwakeMode = mode
    world.keepAwakeEndsAt = if (mode == "timed") nowMillis() + minutes * 60_000L else null
    return null
}

/**
 * Adds to a set time that is running, as the Mac does. The demo's agents never finish,
 * so it has no after-agents countdown to add to.
 */
private fun DemoServer.extendKeepAwake(minutes: Int): String? {
    if (minutes !in KEEP_AWAKE_MINUTES) return KEEP_AWAKE_TIME_ERROR
    val now = nowMillis()
    val end = world.keepAwakeEndsAt
    if (world.keepAwakeMode != "timed" || end == null || end <= now) {
        return "Keep awake isn't counting down, so there's no time to add to."
    }
    val latest = now + KEEP_AWAKE_MINUTES.last * 60_000L
    world.keepAwakeEndsAt = minOf(end + minutes * 60_000L, latest)
    return null
}

private fun DemoServer.pushKeepAwake() {
    pushAfter(0.2) { mapOf("t" to "keepAwake", "state" to keepAwakeState()) }
}

private fun DemoServer.keepAwakeState(): Dict {
    val end = world.keepAwakeEndsAt
    if (end != null && end <= nowMillis()) {
        world.keepAwakeMode = "off"
        world.keepAwakeEndsAt = null
    }
    val mode = world.keepAwakeMode
    return mapOf(
        "supported" to true,
        "screenSupported" to true,
        "mode" to mode,
        "active" to (mode != "off"),
        "agents" to if (mode == "agents") KEEP_AWAKE_AGENTS else 0,
        "endsIn" to world.keepAwakeEndsAt?.let { it - nowMillis() },
        "tailMinutes" to 5,
        "screen" to true,
        "battery" to true,
        "floor" to 20,
        "power" to if (mode == "off") "idle" else "awake"
    )
}
