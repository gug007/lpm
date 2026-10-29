package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings
import java.security.GeneralSecurityException
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Opens an lpm push blob (iOS `PushPayload.open`): base64 `nonce(12) || ciphertext ||
 * tag(16)`, AES-256-GCM under the shared push key, decoded to its JSON object. Null on
 * any failure, so garbage is dropped rather than shown.
 */
object PushCrypto {
    private const val NONCE_BYTES = 12
    private const val TAG_BITS = 128

    fun open(blob: String, key: ByteArray): JsonObject? {
        val sealed = try {
            Base64.getDecoder().decode(blob)
        } catch (e: IllegalArgumentException) {
            return null
        }
        if (key.size != 32 || sealed.size <= NONCE_BYTES) return null
        val plain = try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES)
            )
            cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
        } catch (e: GeneralSecurityException) {
            return null
        }
        return try {
            Json.parseToJsonElement(plain.decodeToString()) as? JsonObject
        } catch (e: SerializationException) {
            null
        }
    }
}

/** Which of Settings → Notifications' kinds a push belongs to; one channel each. */
enum class PushKind {
    Waiting,
    Done,
    Error,
    AutomationStarted,
    AutomationDone,
    AutomationError,
    WeeklyRecap
}

/**
 * An agent or automation alert, as the notification shows it (iOS
 * `NotificationService.rewritten`): the project the way the Mac's sidebar names it,
 * then "<terminal> — <what happened>".
 */
data class PushAlert(
    val serverId: String?,
    val project: String,
    val title: String,
    val body: String,
    val kind: PushKind,
    val target: String?,
    val terminalId: String?,
    val automationId: String?,
    val statusKey: String,
    val status: String,
    /** The alert's own report time, which an answer names back. */
    val ts: Long? = null,
    /** The buttons it offers; only a terminal alert that names its terminal and report. */
    val actions: List<AgentAnswerAction> = emptyList(),
    /** The words a finished agent ended its turn on, most often its question. */
    val summary: String? = null
) {
    /** What the Mac needs to take an answer to this alert. */
    fun answer(action: AgentAnswerAction, text: String? = null): AgentAnswer? {
        if (action !in actions) return null
        return AgentAnswer(
            serverId = serverId,
            project = project,
            terminalId = terminalId ?: return null,
            key = statusKey,
            ts = ts ?: return null,
            action = action,
            text = text
        )
    }

    companion object {
        fun parse(o: JsonObject): PushAlert? {
            val project = o.string("project")?.takeIf { it.isNotEmpty() } ?: return null
            val terminal = o.string("terminal").orEmpty()
            val status = o.string("status").orEmpty()
            val target = o.string("target")?.takeIf { it.isNotEmpty() }
            val label = o.string("projectLabel").orEmpty()
            val terminalId = o.string("terminalId")?.takeIf { it.isNotEmpty() }
            val key = o.string("key").orEmpty()
            val ts = o.long("ts")
            val answerable = target != "automation" && terminalId != null && key.isNotEmpty() &&
                ts != null
            val changes = changesText(o.obj("changes"))
            return PushAlert(
                serverId = o.string("serverId")?.takeIf { it.isNotEmpty() },
                project = project,
                title = label.ifEmpty { project },
                body = body(terminal, status) + changes?.let { " · $it" }.orEmpty(),
                kind = kind(target, status),
                target = target,
                terminalId = terminalId,
                automationId = o.string("automationId")?.takeIf { it.isNotEmpty() },
                statusKey = key,
                status = status,
                ts = ts,
                actions = if (answerable) {
                    AgentAnswerAction.offered(o.strings("actions").orEmpty())
                } else {
                    emptyList()
                },
                summary = o.string("summary")?.takeIf { it.isNotEmpty() }
            )
        }

        /** "4 files, +143 −21": what the project's uncommitted changes come to. */
        fun changesText(changes: JsonObject?): String? {
            val files = changes?.int("files")?.takeIf { it > 0 } ?: return null
            val added = changes.int("added") ?: 0
            val removed = changes.int("removed") ?: 0
            return "$files ${if (files == 1) "file" else "files"}, +$added −$removed"
        }

        private fun body(terminal: String, status: String): String {
            val phrase = when (status) {
                "Waiting" -> "Agent is waiting for you"
                "Done" -> "Agent finished"
                "Error" -> "Agent hit an error"
                else -> status
            }
            return if (terminal.isEmpty()) phrase else "$terminal — $phrase"
        }

        // An automation's status is the Mac's sentence ("Automation finished · …").
        private fun kind(target: String?, status: String): PushKind = when {
            target != "automation" -> when (status) {
                "Waiting" -> PushKind.Waiting
                "Error" -> PushKind.Error
                else -> PushKind.Done
            }

            status.startsWith("Automation started") ||
                status.startsWith("Automation found work") -> PushKind.AutomationStarted

            status.startsWith("Automation finished") -> PushKind.AutomationDone

            else -> PushKind.AutomationError
        }
    }
}

/**
 * A withdrawal: the status entries a Mac no longer has, whose notifications should
 * go (iOS `AppDelegate.didReceiveRemoteNotification`).
 */
data class PushClear(val serverId: String?, val entries: Set<StatusIdentity>) {
    companion object {
        fun parse(o: JsonObject): PushClear? {
            val clears = o.objects("clear") ?: return null
            val entries = clears.mapNotNull { entry ->
                val project = entry.string("project") ?: return@mapNotNull null
                val key = entry.string("key") ?: return@mapNotNull null
                StatusIdentity(project, key)
            }.toSet()
            if (entries.isEmpty()) return null
            return PushClear(o.string("serverId")?.takeIf { it.isNotEmpty() }, entries)
        }
    }
}

/** A delivered notification's (project, status entry key) pair. */
data class StatusIdentity(val project: String, val key: String)

/**
 * Whether a notification from `a` may be touched by news from `b`: equal when both
 * carry an id, and a match when either lacks one (an older Mac sends none).
 */
fun serverIdsMatch(a: String?, b: String?): Boolean =
    a.isNullOrEmpty() || b.isNullOrEmpty() || a == b
