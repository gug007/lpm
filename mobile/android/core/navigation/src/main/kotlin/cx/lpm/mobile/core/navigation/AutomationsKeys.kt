package cx.lpm.mobile.core.navigation

import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.serialization.Serializable

/** The automations list: every project's, or one project's when `project` is set. */
@Serializable
data class AutomationsKey(val project: String? = null, val session: SessionKey = SessionKey.Live) :
    NavKey

/**
 * One automation's page, opened for `project` (the list's project, the one a
 * notification names, or the job's first target).
 */
@Serializable
data class AutomationKey(
    val project: String,
    val jobId: String,
    val session: SessionKey = SessionKey.Live
) : NavKey

/** One run of an automation as a conversation; `rootAt` is the run that started it. */
@Serializable
data class AutomationRunKey(
    val project: String,
    val jobId: String,
    val rootAt: Long,
    val session: SessionKey = SessionKey.Live
) : NavKey
