package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.string
import kotlinx.serialization.json.JsonObject

/**
 * A notification in the Mac's own words: a limit reminder that fired, which opens that
 * Mac's Usage screen, Keep awake about to let go, which opens that Mac's connection page,
 * CI on a commit pushed from it, which opens [project], or an agent's `lpm generate`
 * waiting for a yes, which opens the app on that Mac, where the request shows itself.
 */
data class PushMacNotice(
    val serverId: String?,
    val target: String,
    val title: String,
    val body: String,
    val key: String,
    val project: String? = null
) {
    companion object {
        const val USAGE = "usage"
        const val KEEP_AWAKE = "keepAwake"
        const val CI = "ci"
        const val GENERATE = "generate"

        private val TARGETS = setOf(USAGE, KEEP_AWAKE, CI, GENERATE)

        fun parse(o: JsonObject): PushMacNotice? {
            val target = o.string("target")?.takeIf { it in TARGETS }
                ?: return null
            val title = o.string("title").orEmpty()
            val project = o.string("project")?.takeIf { it.isNotEmpty() }
            if (title.isEmpty() || (target == CI && project == null)) return null
            return PushMacNotice(
                serverId = o.string("serverId")?.takeIf { it.isNotEmpty() },
                target = target,
                title = title,
                body = o.string("body").orEmpty(),
                key = o.string("key").orEmpty(),
                project = project
            )
        }
    }
}
