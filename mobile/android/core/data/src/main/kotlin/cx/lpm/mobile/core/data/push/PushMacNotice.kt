package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.string
import kotlinx.serialization.json.JsonObject

/**
 * A notification about a Mac rather than one of its projects, shown with the Mac's own
 * title and body: a limit reminder that fired, which opens that Mac's Usage screen, or
 * Keep awake about to let go, which opens that Mac's connection page.
 */
data class PushMacNotice(
    val serverId: String?,
    val target: String,
    val title: String,
    val body: String,
    val key: String
) {
    companion object {
        const val USAGE = "usage"
        const val KEEP_AWAKE = "keepAwake"

        fun parse(o: JsonObject): PushMacNotice? {
            val target = o.string("target")?.takeIf { it == USAGE || it == KEEP_AWAKE }
                ?: return null
            val title = o.string("title").orEmpty()
            if (title.isEmpty()) return null
            return PushMacNotice(
                serverId = o.string("serverId")?.takeIf { it.isNotEmpty() },
                target = target,
                title = title,
                body = o.string("body").orEmpty(),
                key = o.string("key").orEmpty()
            )
        }
    }
}
