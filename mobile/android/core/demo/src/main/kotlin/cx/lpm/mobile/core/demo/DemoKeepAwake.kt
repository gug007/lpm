package cx.lpm.mobile.core.demo

private val KEEP_AWAKE_MODES = setOf("off", "agents", "timed", "always")
private const val KEEP_AWAKE_AGENTS = 2

/**
 * Demo handlers for Keep awake: the demo Mac starts kept awake while two of its agents
 * work, and takes every change the menus make (iOS `DemoKeepAwake.swift`).
 */
internal fun DemoServer.registerKeepAwakeHandlers() {
    register("keepAwake") { pushKeepAwake() }
    register("keepAwakeSet") { o ->
        val mode = o.string("mode").orEmpty()
        val minutes = o.int("minutes") ?: 0
        val error = when {
            mode !in KEEP_AWAKE_MODES -> "Unknown Keep awake mode \"$mode\"."

            mode == "timed" && minutes !in 1..5999 ->
                "Pick a time between 1 minute and 99 hours 59 minutes."

            else -> null
        }
        if (error == null) {
            world.keepAwakeMode = mode
            world.keepAwakeEndsAt = if (mode == "timed") nowMillis() + minutes * 60_000L else null
        }
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
