package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonElement

/**
 * The Mac's Settings › Git › Auto pull: off everywhere, only for the projects
 * set to On, or for every project not set to Off.
 */
enum class AutoPullMode(val rawValue: String) {
    Off("off"),
    Chosen("chosen"),
    All("all")
    ;

    companion object {
        fun fromWire(wire: JsonElement?): AutoPullMode = wire.asString()?.let { raw ->
            entries.firstOrNull { it.rawValue == raw }
        } ?: Off
    }
}

/**
 * Whether lpm fast-forwards a project by itself, resolved exactly as the desktop
 * does: the Mac's setting gates everything, then the project's own choice, then
 * (for a duplicate or worktree) its parent's, then the setting.
 */
fun autoPullEnabled(own: Boolean?, parent: Project?, mode: AutoPullMode): Boolean {
    if (mode == AutoPullMode.Off) return false
    return own ?: parent?.autoPull ?: (mode == AutoPullMode.All)
}

/** The project's last auto pull, present only while it can still be undone. */
data class AutoPulled(
    val count: Int,
    val branch: String,
    val from: String,
    val to: String,
    val at: Long
) {
    val summary: String
        get() {
            val commits = "$count commit${if (count == 1) "" else "s"}"
            return if (branch.isEmpty()) commits else "$commits on $branch"
        }

    companion object {
        fun parse(o: JsonElement?): AutoPulled? = o.asObject()?.let {
            AutoPulled(
                count = it.int("count") ?: 0,
                branch = it.string("branch").orEmpty(),
                from = it.string("from").orEmpty(),
                to = it.string("to").orEmpty(),
                at = it.long("at") ?: 0
            )
        }
    }
}
