package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * What a popup or app page asks of the phone through `bootstrap.js` (iOS
 * `ActionPageAsk`; PROTOCOL.md, Action popups): a run of one of the project's
 * actions, or its data again.
 */
sealed interface ActionPageAsk {
    data class Run(val id: String, val action: String, val inputs: Map<String, String>) :
        ActionPageAsk

    data object Refresh : ActionPageAsk

    companion object {
        /** The page's message as `bootstrap.js` posts it, as JSON; null for anything else. */
        fun parse(message: String): ActionPageAsk? {
            val o =
                runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull()
                    ?: return null
            if (o["lpmRefresh"].asBool() == true) return Refresh
            val run = o["lpmRun"] as? JsonObject ?: return null
            val id = run["id"].asString() ?: return null
            val action = run["action"].asString() ?: return null
            val inputs = (run["inputs"] as? JsonObject).orEmpty()
                .mapNotNull { (key, value) -> value.asString()?.let { key to it } }
                .toMap()
            return Run(id, action, inputs)
        }
    }
}

/** What a page's `lpm.run` resolves with (iOS `ActionPageRunResult`). */
data class ActionPageRunResult(
    val ok: Boolean = false,
    val output: String = "",
    val error: String = "",
    val canceled: Boolean = false
) {
    /** The reply `window.__lpmReply` takes, as JSON. */
    fun json(id: String): String = buildJsonObject {
        put("id", id)
        put("ok", ok)
        put("output", output)
        put("error", error)
        put("canceled", canceled)
    }.toString()

    companion object {
        /** The newest part of a run's output a page gets back, as on the desktop. */
        private const val MAX_OUTPUT = 256 * 1024
        private val COLORS = Regex("\u001B\\[[0-9;:]*m")

        fun output(text: String): String {
            val plain = text.replace(COLORS, "").removeSuffix("\n")
            return if (plain.length > MAX_OUTPUT) plain.takeLast(MAX_OUTPUT) else plain
        }
    }
}

/** The values a page gave an action's inputs, and whether they leave nothing to ask. */
data class ActionPageInputs(val values: Map<String, String>, val complete: Boolean)

/** The values a page gave the action's inputs, each one the input takes. */
fun Action.pageInputs(given: Map<String, String>): ActionPageInputs {
    val values = buildMap {
        for (input in inputs) {
            val value = given[input.key] ?: continue
            if (input.required && value.trimmingWhitespace().isEmpty()) continue
            if (input.options.isNotEmpty() && input.options.none { it.value == value }) continue
            put(input.key, value)
        }
    }
    return ActionPageInputs(values, inputs.all { it.key in values })
}

/**
 * The action a page names, found as the desktop finds it: by its path, then by a
 * nested action's own name, then by either in any case, then by its label.
 */
fun List<Action>.pageAction(named: String): Action? {
    val all = flatMap { it.withNested() }
    all.firstOrNull { it.name == named }?.let { return it }
    fun only(matches: List<Action>) = matches.singleOrNull()
    if (':' !in named) only(all.filter { it.childKey == named })?.let { return it }
    val lower = named.lowercase()
    only(
        all.filter {
            it.name.lowercase() == lower || it.childKey.lowercase() == lower
        }
    )?.let { return it }
    return only(all.filter { it.label.lowercase() == lower })
}

private fun Action.withNested(): List<Action> = listOf(this) + children.flatMap { it.withNested() }
