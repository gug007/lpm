package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * Where a Talk plan starts its agent: in a new copy of the project, in a new worktree
 * of it, or in the project itself.
 */
enum class TalkPlace(val wire: String) {
    Copy("copy"),
    Worktree("worktree"),
    Here("here")
}

/**
 * What the Mac made of one spoken or typed request (`talkPlan`). The phone may change
 * the project, the agent and the prompt, and sends the whole plan back with `talkRun`.
 * Only from a Mac whose `features` has "talk".
 */
data class TalkPlan(
    /** Empty when the Mac couldn't tell which project was meant. */
    val project: String,
    val place: TalkPlace,
    val agent: String,
    val prompt: String,
    val label: String
) {
    /** Approve waits for a project and something to tell the agent. */
    val canRun: Boolean get() = project.isNotEmpty() && prompt.trimmingWhitespace().isNotEmpty()

    val stepCount: String get() = if (place == TalkPlace.Here) "2 steps" else "3 steps"

    val placeTitle: String
        get() = when (place) {
            TalkPlace.Copy -> "Duplicate"
            TalkPlace.Worktree -> "Worktree"
            TalkPlace.Here -> "In"
        }

    /** The Start row: the agent, and where it starts when that isn't the project itself. */
    fun startLine(agent: String): String = when (place) {
        TalkPlace.Copy -> "$agent, in the copy"
        TalkPlace.Worktree -> "$agent, in the worktree"
        TalkPlace.Here -> agent
    }

    companion object {
        fun parse(o: JsonObject): TalkPlan? {
            val where = o.string("where")
            val place = TalkPlace.entries.firstOrNull { it.wire == where } ?: return null
            return TalkPlan(
                project = o.string("project").orEmpty(),
                place = place,
                agent = o.string("agent").orEmpty(),
                prompt = o.string("prompt").orEmpty(),
                label = o.string("label").orEmpty()
            )
        }
    }
}
