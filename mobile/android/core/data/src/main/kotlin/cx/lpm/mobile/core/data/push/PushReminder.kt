package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.string
import kotlinx.serialization.json.JsonObject

/**
 * A limit reminder that fired on a Mac: shown with the Mac's own title and body, and
 * opens that Mac's Usage screen.
 */
data class PushReminder(
    val serverId: String?,
    val title: String,
    val body: String,
    val key: String
) {
    companion object {
        const val TARGET = "usage"

        fun parse(o: JsonObject): PushReminder? {
            if (o.string("target") != TARGET) return null
            val title = o.string("title").orEmpty()
            if (title.isEmpty()) return null
            return PushReminder(
                serverId = o.string("serverId")?.takeIf { it.isNotEmpty() },
                title = title,
                body = o.string("body").orEmpty(),
                key = o.string("key").orEmpty()
            )
        }
    }
}
