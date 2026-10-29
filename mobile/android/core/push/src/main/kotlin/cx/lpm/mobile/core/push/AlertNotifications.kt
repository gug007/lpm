package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import cx.lpm.mobile.core.data.push.AgentAnswerAction
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushKind
import cx.lpm.mobile.core.data.push.PushRecap
import cx.lpm.mobile.core.data.push.PushReminder

/** What an alert's notification carries to be opened, answered and withdrawn later. */
internal object AlertExtras {
    const val STATUS_KEY = "statusKey"
    const val STATUS = "status"
    const val TITLE = "alert.title"
    const val BODY = "alert.body"
    const val KIND = "alert.kind"
    const val TS = "alert.ts"
    const val ACTIONS = "alert.actions"

    /** Alerts share one id; the tag tells them apart. */
    const val NOTIFICATION_ID = 1
}

internal fun PushAlert.extras(): Bundle = Bundle().apply {
    putString(NotificationOpenTarget.PROJECT, project)
    putString(NotificationOpenTarget.TARGET, target)
    putString(NotificationOpenTarget.TERMINAL_ID, terminalId)
    putString(NotificationOpenTarget.AUTOMATION_ID, automationId)
    putString(NotificationOpenTarget.SERVER_ID, serverId)
    putString(AlertExtras.STATUS_KEY, statusKey)
    putString(AlertExtras.STATUS, status.ifEmpty { null })
    putString(AlertExtras.TITLE, title)
    putString(AlertExtras.BODY, body)
    putString(AlertExtras.KIND, kind.name)
    ts?.let { putLong(AlertExtras.TS, it) }
    putStringArrayList(AlertExtras.ACTIONS, ArrayList(actions.map { it.wire }))
}

internal fun Bundle.toAlert(): PushAlert? = PushAlert(
    serverId = getString(NotificationOpenTarget.SERVER_ID),
    project = getString(NotificationOpenTarget.PROJECT) ?: return null,
    title = getString(AlertExtras.TITLE).orEmpty(),
    body = getString(AlertExtras.BODY).orEmpty(),
    kind = PushKind.entries.firstOrNull { it.name == getString(AlertExtras.KIND) } ?: return null,
    target = getString(NotificationOpenTarget.TARGET),
    terminalId = getString(NotificationOpenTarget.TERMINAL_ID),
    automationId = getString(NotificationOpenTarget.AUTOMATION_ID),
    statusKey = getString(AlertExtras.STATUS_KEY).orEmpty(),
    status = getString(AlertExtras.STATUS).orEmpty(),
    ts = if (containsKey(AlertExtras.TS)) getLong(AlertExtras.TS) else null,
    actions = getStringArrayList(AlertExtras.ACTIONS).orEmpty().mapNotNull(AgentAnswerAction::of)
)

/** Opens the app's launcher activity, which reads `extras` to know where to go. */
internal fun Context.openIntent(requestCode: Int, extras: Bundle): PendingIntent {
    val open = Intent(PushNotifier.ACTION_OPEN)
        .setPackage(packageName)
        .addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
        .putExtras(extras)
    packageManager.getLaunchIntentForPackage(packageName)?.component?.let(open::setComponent)
    return PendingIntent.getActivity(
        this,
        requestCode,
        open,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
}

/**
 * An alert as the notification shows it: on its kind's channel, the project as
 * title, `body`, and a tap that opens what it is about. The answers it offers are
 * buttons unless `answers` is false.
 */
internal fun Context.alertNotification(
    alert: PushAlert,
    tag: String,
    body: String = alert.body,
    answers: Boolean = true,
    quiet: Boolean = false
): NotificationCompat.Builder {
    val extras = alert.extras()
    // A finish carries the words the agent ended on under the line saying so.
    val expanded = alert.summary?.let { "$body\n$it" } ?: body
    val builder = NotificationCompat.Builder(
        this,
        if (quiet) QUIET_CHANNEL else alert.kind.channelId
    )
        .setSmallIcon(R.drawable.ic_stat_lpm)
        .setContentTitle(alert.title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(expanded))
        .setPriority(
            when {
                quiet -> NotificationCompat.PRIORITY_LOW

                alert.kind.importance == NotificationManager.IMPORTANCE_HIGH ->
                    NotificationCompat.PRIORITY_HIGH

                else -> NotificationCompat.PRIORITY_DEFAULT
            }
        )
        .setSilent(quiet)
        .setAutoCancel(true)
        .setContentIntent(openIntent(tag.hashCode(), extras))
        .addExtras(extras)
    if (answers) {
        answerActions(alert, tag).forEach(builder::addAction)
        // A finished turn that takes a reply also opens its review screen or its tab.
        if (AgentAnswerAction.Reply in alert.actions) {
            val changes = Bundle(extras).apply {
                putString(NotificationOpenTarget.TARGET, NotificationOpenTarget.CHANGES)
            }
            builder.addAction(
                NotificationCompat.Action.Builder(
                    null,
                    getString(R.string.answer_review_changes),
                    openIntent("$tag|changes".hashCode(), changes)
                ).build()
            )
            builder.addAction(
                NotificationCompat.Action.Builder(
                    null,
                    getString(R.string.answer_open_tab),
                    openIntent("$tag|open".hashCode(), extras)
                ).build()
            )
        }
    }
    return builder
}

/** A limit reminder as the Mac words it; a tap opens that Mac's Usage screen. */
internal fun Context.reminderNotification(
    reminder: PushReminder,
    tag: String,
    quiet: Boolean
): NotificationCompat.Builder = macNotification(
    reminder.serverId,
    PushReminder.TARGET,
    reminder.title,
    reminder.body,
    REMINDER_CHANNEL,
    tag,
    quiet
)

/** The weekly recap as the Mac words it; a tap opens that Mac's recap on last week. */
internal fun Context.recapNotification(
    recap: PushRecap,
    tag: String,
    quiet: Boolean
): NotificationCompat.Builder = macNotification(
    recap.serverId,
    PushRecap.TARGET,
    recap.title,
    recap.body,
    PushKind.WeeklyRecap.channelId,
    tag,
    quiet
)

/** Where everything that arrives during quiet hours goes: no sound, no heads-up. */
internal const val QUIET_CHANNEL = "quiet-hours"

internal const val REMINDER_CHANNEL = "limit-reminders"

/** A notification about a Mac rather than one of its projects; a tap opens `target` there. */
private fun Context.macNotification(
    serverId: String?,
    target: String,
    title: String,
    body: String,
    channel: String,
    tag: String,
    quiet: Boolean
): NotificationCompat.Builder {
    val extras = Bundle().apply {
        putString(NotificationOpenTarget.SERVER_ID, serverId)
        putString(NotificationOpenTarget.TARGET, target)
    }
    return NotificationCompat.Builder(this, if (quiet) QUIET_CHANNEL else channel)
        .setSmallIcon(R.drawable.ic_stat_lpm)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setSilent(quiet)
        .setAutoCancel(true)
        .setContentIntent(openIntent(tag.hashCode(), extras))
        .addExtras(extras)
}

internal fun Context.mayPostNotifications(): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
        return false
    }
    return NotificationManagerCompat.from(this).areNotificationsEnabled()
}

/** Posts `build()` unless this app may not post notifications. */
internal fun Context.notifyIfAllowed(tag: String, id: Int, build: () -> Notification) {
    if (!mayPostNotifications()) return
    try {
        NotificationManagerCompat.from(this).notify(tag, id, build())
    } catch (e: SecurityException) {
        // The permission was revoked between the check and the post.
    }
}

internal fun appOnScreen(): Boolean =
    ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
