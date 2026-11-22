package cx.lpm.mobile.core.demo

private const val POWER_AGENTS = 2

/**
 * Demo handlers for Lock or Sleep: the demo Mac can do both, two of its agents are
 * working, and it takes every choice without actually sleeping (iOS `DemoPower.swift`).
 */
internal fun DemoServer.registerPowerHandlers() {
    register("power") { pushPower() }
    register("lockScreen") { answerPower("lockScreen") }
    register("sleepNow") { answerPower("sleepNow") }
    register("sleepWhenIdle") { o ->
        world.powerArmed = o.bool("on") ?: true
        answerPower("sleepWhenIdle", withState = true)
        pushPower()
    }
}

private fun DemoServer.answerPower(t: String, withState: Boolean = false) {
    pushAfter(0.2) {
        buildMap {
            put("t", t)
            put("ok", true)
            if (withState) put("state", powerState())
        }
    }
}

private fun DemoServer.pushPower() {
    pushAfter(0.2) { mapOf("t" to "power", "state" to powerState()) }
}

private fun DemoServer.powerState(): Dict = mapOf(
    "lock" to true,
    "sleep" to true,
    "armed" to world.powerArmed,
    "agents" to POWER_AGENTS,
    "automations" to 0
)
