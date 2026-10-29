package cx.lpm.mobile.core.data.push

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where a tapped notification leads (iOS `NotificationOpenTarget`). */
data class NotificationOpenTarget(
    val serverId: String?,
    val project: String,
    val kind: Kind,
    val itemId: String?
) {
    enum class Kind { Project, Terminal, Automation, Recap, Changes, Usage }

    companion object {
        const val PROJECT = "project"
        const val TARGET = "target"
        const val TERMINAL_ID = "terminalId"
        const val AUTOMATION_ID = "automationId"
        const val SERVER_ID = "serverId"

        /** A finished turn's Review Changes button: the project's review screen. */
        const val CHANGES = "changes"

        /**
         * Reads the extras a posted notification carries; null without a project,
         * except for the weekly recap and Usage, which belong to the Mac as a whole.
         */
        fun from(extra: (String) -> String?): NotificationOpenTarget? {
            val serverId = extra(SERVER_ID)?.takeIf { it.isNotEmpty() }
            val whole = when (extra(TARGET)) {
                PushRecap.TARGET -> Kind.Recap
                PushReminder.TARGET -> Kind.Usage
                else -> null
            }
            if (whole != null) {
                return NotificationOpenTarget(
                    serverId = serverId,
                    project = "",
                    kind = whole,
                    itemId = null
                )
            }
            val project = extra(PROJECT)?.takeIf { it.isNotEmpty() } ?: return null
            if (extra(TARGET) == CHANGES) {
                return NotificationOpenTarget(
                    serverId = serverId,
                    project = project,
                    kind = Kind.Changes,
                    itemId = null
                )
            }
            val itemId = when (extra(TARGET)) {
                "terminal" -> extra(TERMINAL_ID)
                "automation" -> extra(AUTOMATION_ID)
                else -> null
            }?.takeIf { it.isNotEmpty() }
            val kind = when {
                itemId == null -> Kind.Project
                extra(TARGET) == "terminal" -> Kind.Terminal
                else -> Kind.Automation
            }
            return NotificationOpenTarget(
                serverId = serverId,
                project = project,
                kind = kind,
                itemId = itemId
            )
        }
    }
}

/**
 * The tapped notification the app still has to open (iOS
 * `AppModel.pendingNotificationTarget`): set by the activity, consumed by the root
 * screen once the right Mac and its projects are loaded.
 */
@Singleton
class NotificationOpens @Inject constructor() {
    private val mutablePending = MutableStateFlow<NotificationOpenTarget?>(null)
    val pending: StateFlow<NotificationOpenTarget?> = mutablePending.asStateFlow()

    fun open(target: NotificationOpenTarget) {
        mutablePending.value = target
    }

    /** Drops `target` if it's still the pending one, or whatever is pending. */
    fun clear(target: NotificationOpenTarget? = null) {
        if (target == null || mutablePending.value == target) mutablePending.value = null
    }
}
