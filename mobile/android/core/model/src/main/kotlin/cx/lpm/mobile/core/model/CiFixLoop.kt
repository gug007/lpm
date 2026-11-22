package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * Keep fixing until green on a project (`ciFixLoop`): the agent a Fix with …
 * opened gets each new failure after it pushes, until the checks pass.
 */
data class CiFixLoop(
    val project: String,
    val agent: String,
    val branch: String,
    val round: Int,
    val maxRounds: Int,
    /** "starting", "fixing", "watching", then "passed", "stopped" or "cancelled". */
    val state: String,
    val sha: String,
    /** Where it stands, in one line, as the Mac words it. */
    val detail: String,
    val progress: Double
) {
    val running: Boolean get() = state == "starting" || state == "fixing" || state == "watching"
    val roundLabel: String get() = "Round $round of $maxRounds"

    companion object {
        fun parse(o: JsonObject): CiFixLoop? {
            val project = o.string("project")?.takeIf { it.isNotEmpty() } ?: return null
            val state = o.string("state")?.takeIf { it.isNotEmpty() } ?: return null
            return CiFixLoop(
                project = project,
                agent = o.string("agent").orEmpty(),
                branch = o.string("branch").orEmpty(),
                round = o.int("round") ?: 1,
                maxRounds = o.int("maxRounds") ?: 3,
                state = state,
                sha = o.string("sha").orEmpty(),
                detail = o.string("detail").orEmpty(),
                progress = o.number("progress") ?: 0.0
            )
        }
    }
}
