package cx.lpm.mobile.core.model

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One option of a pick-from-a-list question. */
data class AutomationAskOption(val label: String, val description: String)

/** One question of an automation's JobAsk. A type this build doesn't know is answered as text. */
data class AutomationAskQuestion(
    val id: String,
    val type: String,
    val text: String,
    val yes: String,
    val no: String,
    val options: List<AutomationAskOption>,
    val multiple: Boolean,
    /** The list also takes an answer in the user's own words. */
    val other: Boolean,
    val multiline: Boolean,
    val placeholder: String,
    val optional: Boolean,
    val defaultAnswer: JsonElement?
) {
    val yesLabel: String get() = yes.ifEmpty { "Yes" }
    val noLabel: String get() = no.ifEmpty { "No" }

    companion object {
        fun parse(o: JsonObject): AutomationAskQuestion = AutomationAskQuestion(
            id = o.string("id").orEmpty(),
            type = o.string("type") ?: "text",
            text = o.string("text").orEmpty(),
            yes = o.string("yes").orEmpty(),
            no = o.string("no").orEmpty(),
            options = o.objects("options").orEmpty().map {
                AutomationAskOption(
                    it.string("label").orEmpty(),
                    it.string("description").orEmpty()
                )
            },
            multiple = o.bool("multiple") ?: false,
            other = o.bool("other") ?: false,
            multiline = o.bool("multiline") ?: false,
            placeholder = o.string("placeholder").orEmpty(),
            optional = o.bool("optional") ?: false,
            defaultAnswer = o["default"]
        )
    }
}

/** A question an automation run put to the user (`lpm ask`), and how it ended. */
data class AutomationAsk(
    val id: String,
    val askedAt: Long,
    val questions: List<AutomationAskQuestion>,
    val expiresAt: Long?,
    val status: String,
    val answers: JsonObject,
    /** The user's own words, when they answered with a plain reply. */
    val reply: String?,
    val answeredAt: Long?,
    /** Nobody answered in time and the defaults stood in. */
    val auto: Boolean,
    /** On an automation row: where it waits — the project to answer in. */
    val project: String,
    /**
     * What the asker filed it under: one open question per key, none of them
     * holding the automation up, and its answer goes to its onAnswer command.
     */
    val key: String? = null,
    /** On an automation row: the run entry that asked it; null while that run is still going. */
    val at: Long? = null
) {
    val isOpen: Boolean get() = status == "open"

    /** A question asked without a key stops the automation's runs until it's answered. */
    val holdsJob: Boolean get() = key == null

    /** One question settled by a single tap: its yes or no, or the one option it takes. */
    val answersOnTap: Boolean
        get() {
            val q = questions.singleOrNull() ?: return false
            return q.type == "confirm" || (q.type == "choice" && !q.multiple)
        }

    /** The first question, and how many more come with it. */
    val summary: String
        get() {
            val first = questions.firstOrNull()?.text.orEmpty()
            return if (questions.size > 1) "$first (+${questions.size - 1} more)" else first
        }

    /** How the question ended, for the line over it. */
    val statusLabel: String
        get() = when (status) {
            "open" -> AUTOMATION_WAITING_LABEL

            "answered" -> when {
                auto -> "No answer in time — the default was used"
                reply == null -> "Answered"
                else -> "Answered in a reply"
            }

            "dismissed" -> "Skipped"

            "replaced" -> "Replaced by a newer question"

            else -> "No answer"
        }

    companion object {
        fun parse(element: JsonElement?): AutomationAsk? {
            val o = element as? JsonObject ?: return null
            val id = o.string("id") ?: return null
            return AutomationAsk(
                id = id,
                askedAt = o.long("askedAt") ?: 0,
                questions = o.objects("questions").orEmpty().map(AutomationAskQuestion::parse),
                expiresAt = o.long("expiresAt"),
                status = o.string("status") ?: "open",
                answers = o.obj("answers") ?: JsonObject(emptyMap()),
                reply = o.string("reply"),
                answeredAt = o.long("answeredAt"),
                auto = o.bool("auto") ?: false,
                project = o.string("project").orEmpty(),
                key = o.string("key"),
                at = o.long("at")
            )
        }
    }
}

const val AUTOMATION_WAITING_LABEL = "Waiting for your answer"

/** What the user has filled in for one question so far. */
data class AutomationAskDraft(
    val picks: List<String> = emptyList(),
    val other: String = "",
    val text: String = ""
)

fun automationAskAnswer(q: AutomationAskQuestion, d: AutomationAskDraft): JsonElement? =
    when (q.type) {
        "confirm" -> when (d.picks.firstOrNull()) {
            "yes" -> JsonPrimitive(true)
            "no" -> JsonPrimitive(false)
            else -> null
        }

        "choice" -> {
            val own = if (q.other) d.other.trimmingWhitespace() else ""
            val picks = if (own.isEmpty()) d.picks else d.picks + own
            if (picks.isEmpty()) null else JsonArray(picks.map(::JsonPrimitive))
        }

        else -> d.text.trimmingWhitespace().takeIf { it.isNotEmpty() }?.let(::JsonPrimitive)
    }

/** Every answer the drafts give, and the first question still waiting for one. */
fun automationAskAnswers(
    questions: List<AutomationAskQuestion>,
    drafts: Map<String, AutomationAskDraft>
): Pair<JsonObject, AutomationAskQuestion?> {
    val answers = linkedMapOf<String, JsonElement>()
    var missing: AutomationAskQuestion? = null
    for (q in questions) {
        val a = automationAskAnswer(q, drafts[q.id] ?: AutomationAskDraft())
        if (a != null) {
            answers[q.id] = a
        } else if (!q.optional && missing == null) {
            missing = q
        }
    }
    return JsonObject(answers) to missing
}

/** Pick (or unpick) an option: one at a time unless the question takes several. */
fun automationAskToggle(
    q: AutomationAskQuestion,
    d: AutomationAskDraft,
    label: String
): AutomationAskDraft = when {
    label in d.picks -> d.copy(picks = d.picks - label)
    q.multiple -> d.copy(picks = d.picks + label)
    else -> d.copy(picks = listOf(label), other = "")
}

/** An answer the way a person reads it: a button's label, the picks, or the text. */
fun automationAskDisplay(q: AutomationAskQuestion, answer: JsonElement?): String = when (answer) {
    null -> ""

    is JsonArray -> answer.mapNotNull { it.asString() }.joinToString(", ")

    is JsonPrimitive -> {
        val yes = answer.asBool()
        if (q.type == "confirm" && yes != null && !answer.isString) {
            if (yes) q.yesLabel else q.noLabel
        } else {
            answer.content
        }
    }

    else -> ""
}

/** "If nobody answers in 3h, it goes with No" for a question with a deadline. */
fun automationAskDeadlineNote(ask: AutomationAsk, nowSecs: Long): String {
    val expiresAt = ask.expiresAt ?: return ""
    val left = max(0L, expiresAt - nowSecs)
    val mins = max(1, ceil(left / 60.0).toInt())
    val span = when {
        mins < 60 -> "${mins}m"
        mins < 1440 -> "${(mins / 60.0).roundToInt()}h"
        else -> "${(mins / 1440.0).roundToInt()}d"
    }
    val lead = "If nobody answers in $span"
    val only = ask.questions.singleOrNull()
    val default = only?.defaultAnswer
    if (only != null && default != null) {
        return "$lead, it goes with ${automationAskDisplay(only, default)}"
    }
    return when {
        !ask.questions.all {
            it.defaultAnswer != null || it.optional
        } -> "$lead, the question closes"

        ask.questions.any { it.defaultAnswer != null } -> "$lead, it goes on with the defaults"

        else -> "$lead, it goes on without an answer"
    }
}
