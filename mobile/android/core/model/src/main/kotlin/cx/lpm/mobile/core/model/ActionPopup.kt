package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/**
 * An action's popup card as the projects list announces it (PROTOCOL.md, Action
 * popups): the format of its page, the page's height in points and its heading.
 * [problem] says why the config can't make one.
 */
data class ActionPopupInfo(
    val format: String,
    val title: String,
    val height: Int,
    val problem: String
) {
    companion object {
        const val HTML = "html"
        const val DEFAULT_HEIGHT = 220

        fun parse(o: JsonObject?): ActionPopupInfo? = o?.let {
            ActionPopupInfo(
                format = it.string("format").orEmpty(),
                title = it.string("title").orEmpty(),
                height = it.size("height") ?: DEFAULT_HEIGHT,
                problem = it.string("problem").orEmpty()
            )
        }

        /** The page's height on the phone, held to what the Mac allows. */
        fun pageHeight(height: Int): Int = height.coerceIn(80, 560)
    }
}

/** The page and data the Mac made for one opening, or one refresh, of a popup. */
data class ActionPopupContent(
    val format: String,
    val title: String,
    val height: Int,
    /** Seconds between refreshes while the sheet is open; 0 for only when it opens. */
    val refresh: Int,
    /** The whole page; null when it couldn't be made, and [error] says why. */
    val html: String?,
    /** What the `data` command printed, [JsonNull] when it printed none. */
    val data: JsonElement,
    val text: String,
    val dataError: String,
    val error: String,
    /** When the page and data were made, in Unix milliseconds; 0 when unknown. */
    val updatedAt: Long = 0,
    /** Older than the config's `cache`: show it, and ask again with `fresh`. */
    val stale: Boolean = false,
    /** Why the last run failed while this, the last good result, is shown. */
    val refreshError: String = ""
) {
    companion object {
        fun parse(o: JsonObject): ActionPopupContent = ActionPopupContent(
            format = o.string("format") ?: ActionPopupInfo.HTML,
            title = o.string("title").orEmpty(),
            height = o.size("height") ?: ActionPopupInfo.DEFAULT_HEIGHT,
            refresh = (o.size("refresh") ?: 0).coerceAtLeast(0),
            html = o.string("html"),
            data = o["data"] ?: JsonNull,
            text = o.string("text").orEmpty(),
            dataError = o.string("dataError").orEmpty(),
            error = o.string("error").orEmpty(),
            updatedAt = o.numberLong("updatedAt") ?: 0,
            stale = o.bool("stale") ?: false,
            refreshError = o.string("refreshError").orEmpty()
        )
    }
}

/** The Mac's answer to `actionPopup`: the popup's [content], or why there's none. */
data class ActionPopupReply(
    val project: String,
    val action: String,
    val content: ActionPopupContent?,
    val error: String
) {
    companion object {
        fun parse(o: JsonObject): ActionPopupReply {
            val popup = o.obj("popup")?.takeIf { o.bool("ok") == true }
            return ActionPopupReply(
                project = o.string("project").orEmpty(),
                action = o.string("action").orEmpty(),
                content = popup?.let(ActionPopupContent::parse),
                error = when {
                    popup != null -> ""
                    else -> o.string("error")?.ifEmpty { null } ?: ActionPopupCopy.COULD_NOT_OPEN
                }
            )
        }
    }
}

/** What the popup sheet says in place of a page (iOS `ActionPopupCopy`). */
object ActionPopupCopy {
    const val COULD_NOT_OPEN = "Couldn't open the popup."
    const val NEWER_APP = "This popup needs a newer lpm Link."
    const val LATE_ANSWER = "The Mac didn't answer in time."
    const val STOPPED = "The popup stopped working."
}

/** `(x as? NSNumber)?.intValue`: any number, truncated. */
private fun JsonObject.size(key: String): Int? =
    numberLong(key)?.coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong())?.toInt()
