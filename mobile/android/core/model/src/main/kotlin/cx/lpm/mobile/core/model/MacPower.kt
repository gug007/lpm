package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * Locking or sleeping the Mac from here (`power` in PROTOCOL.md): what it can do,
 * whether it sleeps once its agents finish, and what works on it now (iOS `MacPower`).
 */
data class MacPower(
    val canLock: Boolean = false,
    val canSleep: Boolean = false,
    val armed: Boolean = false,
    val agents: Int = 0,
    val automations: Int = 0
) {
    enum class Action(val rawValue: String, val failure: String) {
        LockScreen("lockScreen", "The Mac didn't lock."),
        SleepNow("sleepNow", "The Mac didn't go to sleep."),
        SleepWhenIdle("sleepWhenIdle", "That change didn't go through.");

        companion object {
            fun of(rawValue: String?): Action? = entries.firstOrNull { it.rawValue == rawValue }
        }
    }

    val offered: Boolean get() = canLock || canSleep
    val working: Boolean get() = agents + automations > 0

    /** "2 agents working", "1 agent and 1 automation working", "Nothing working". */
    val workingLine: String
        get() {
            fun count(n: Int, one: String) = if (n == 1) "1 $one" else "$n ${one}s"
            return when {
                agents == 0 && automations == 0 -> "Nothing working"
                automations == 0 -> "${count(agents, "agent")} working"
                agents == 0 -> "${count(automations, "automation")} running"
                else -> "${count(agents, "agent")} and ${count(automations, "automation")} working"
            }
        }

    companion object {
        fun parse(o: JsonObject): MacPower = MacPower(
            canLock = o.bool("lock") ?: false,
            canSleep = o.bool("sleep") ?: false,
            armed = o.bool("armed") ?: false,
            agents = o.int("agents") ?: 0,
            automations = o.int("automations") ?: 0
        )
    }
}
