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
    }
}

/**
 * An action's app as the projects list announces it (PROTOCOL.md, Action apps): a tap
 * opens its page in a full-height sheet instead of running a command.
 */
data class ActionAppInfo(val format: String, val title: String, val problem: String) {
    companion object {
        fun parse(o: JsonObject?): ActionAppInfo? = o?.let {
            ActionAppInfo(
                format = it.string("format").orEmpty(),
                title = it.string("title").orEmpty(),
                problem = it.string("problem").orEmpty()
            )
        }
    }
}

/**
 * Which of an action's pages (iOS `ActionPageView`): the popup a long press opens, or
 * the app a tap opens. The page reads it as `lpm.view`.
 */
enum class ActionPageView(val wire: String) {
    Popup("popup"),
    Tab("tab")
}

/** The page and data the Mac made for one opening, or one refresh, of a popup. */
data class ActionPopupContent(
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

/**
 * The Mac's answer to `actionPopup` or `actionApp`: the page's [content], or why
 * there's none.
 */
data class ActionPopupReply(
    val project: String,
    val action: String,
    val content: ActionPopupContent?,
    val error: String,
    val view: ActionPageView = ActionPageView.Popup
) {
    companion object {
        fun parse(o: JsonObject): ActionPopupReply {
            val view = if (o.string("t") ==
                "actionApp"
            ) {
                ActionPageView.Tab
            } else {
                ActionPageView.Popup
            }
            val key = if (view == ActionPageView.Tab) "app" else "popup"
            val page = o.obj(key)?.takeIf { o.bool("ok") == true }
            return ActionPopupReply(
                project = o.string("project").orEmpty(),
                action = o.string("action").orEmpty(),
                content = page?.let(ActionPopupContent::parse),
                error = when {
                    page != null -> ""

                    else -> o.string("error")?.ifEmpty { null }
                        ?: ActionPopupCopy.couldNotOpen(view)
                },
                view = view
            )
        }
    }
}

/** What the popup or app sheet says in place of a page (iOS `ActionPopupCopy`). */
object ActionPopupCopy {
    const val LATE_ANSWER = "The Mac didn't answer in time."

    fun couldNotOpen(view: ActionPageView): String =
        if (view == ActionPageView.Tab) "Couldn't open the app." else "Couldn't open the popup."

    fun newerApp(view: ActionPageView): String = if (view == ActionPageView.Tab) {
        "This app needs a newer lpm Link."
    } else {
        "This popup needs a newer lpm Link."
    }

    fun stopped(view: ActionPageView): String =
        if (view == ActionPageView.Tab) "The app stopped working." else "The popup stopped working."
}

/** `(x as? NSNumber)?.intValue`: any number, truncated. */
private fun JsonObject.size(key: String): Int? =
    numberLong(key)?.coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong())?.toInt()
