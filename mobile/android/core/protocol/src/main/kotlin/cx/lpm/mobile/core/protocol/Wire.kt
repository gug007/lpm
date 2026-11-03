package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.label
import cx.lpm.mobile.core.model.reqIdString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Outbound frames for the lpm mobile ↔ desktop protocol (mobile/PROTOCOL.md), each
 * a small object encoded to compact JSON text. The builders live in one interface
 * per domain (WireGit, WireNotes, …) so callers write `Wire.gitPush(project)`.
 */
object Wire :
    WireSession,
    WireProjects,
    WireConfig,
    WireTerminals,
    WireComposer,
    WireAutomations,
    WireGit,
    WireMemory,
    WireNotes,
    WireCommands {
    fun json(obj: JsonObject): String = obj.toString()

    /**
     * A `transform`/`historyQuery` reqId echoes back verbatim as a string or a
     * number; normalize either to the string we sent so replies match requests.
     */
    fun reqIdString(v: JsonElement?): String = v.reqIdString()

    /** Frame raw non-UTF-8 input the way the desktop expects (null + "HEX:" + hex). */
    fun hexFrame(bytes: ByteArray): String = buildString {
        append("\u0000HEX:")
        for (b in bytes) {
            val v = b.toInt() and 0xff
            append(HEX_DIGITS[v shr 4]).append(HEX_DIGITS[v and 0xf])
        }
    }

    /**
     * The desktop shows `label || name`; an empty label string (common in YAML)
     * must fall back to another key too, not just a missing one.
     */
    fun label(o: JsonObject, fallback: String): String = o.label(fallback)

    private const val HEX_DIGITS = "0123456789abcdef"
}

internal fun frame(t: String, build: JsonObjectBuilder.() -> Unit = {}): String = buildJsonObject {
    put("t", t)
    build()
}.toString()

internal fun JsonObjectBuilder.putStrings(key: String, values: List<String>) {
    put(key, JsonArray(values.map { JsonPrimitive(it) }))
}

internal fun JsonObjectBuilder.putStringMap(key: String, values: Map<String, String>) {
    put(key, JsonObject(values.mapValues { JsonPrimitive(it.value) }))
}

/** Adds `value` under `key` unless it is null or empty, as Swift's `if let v, !v.isEmpty`. */
internal fun JsonObjectBuilder.putNonEmpty(key: String, value: String?) {
    if (!value.isNullOrEmpty()) put(key, value)
}
