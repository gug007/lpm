package cx.lpm.mobile.core.web

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/**
 * One `window.webkit.messageHandlers[name].postMessage(body)` from a page. The
 * accessors read the body the way the Swift handlers cast `WKScriptMessage.body`
 * (`as? String`, `d["cols"] as? Int`, …): a value of another type reads as null.
 */
internal data class PageMessage(val name: String, val body: JsonElement = JsonNull) {
    val string: String? get() = body.stringOrNull()

    fun string(key: String): String? = field(key)?.stringOrNull()

    fun int(key: String): Int? = field(key)?.numberOrNull()?.intOrNull

    fun double(key: String): Double? = field(key)?.numberOrNull()?.doubleOrNull

    fun boolean(key: String): Boolean? = field(key)?.numberOrNull()?.booleanOrNull

    fun strings(key: String): List<String>? {
        val items = field(key) as? JsonArray ?: return null
        return items.map { it.stringOrNull() ?: return null }
    }

    private fun field(key: String): JsonElement? = (body as? JsonObject)?.get(key)

    companion object {
        /** Parses the shim's `{"name": …, "body": …}` envelope; null if it isn't one. */
        fun parse(data: String?): PageMessage? {
            if (data == null) return null
            val envelope = try {
                Json.parseToJsonElement(data)
            } catch (_: IllegalArgumentException) {
                return null
            } as? JsonObject ?: return null
            val name = envelope["name"]?.stringOrNull() ?: return null
            return PageMessage(name, envelope["body"] ?: JsonNull)
        }
    }
}

private fun JsonElement.stringOrNull(): String? = (this as? JsonPrimitive)?.takeIf {
    it.isString
}?.content

private fun JsonElement.numberOrNull(): JsonPrimitive? = (this as? JsonPrimitive)?.takeIf {
    !it.isString &&
        this !is JsonNull
}
