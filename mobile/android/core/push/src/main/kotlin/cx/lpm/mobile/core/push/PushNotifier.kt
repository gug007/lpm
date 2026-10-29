package cx.lpm.mobile.core.push

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationChannelGroupCompat
import androidx.core.app.NotificationManagerCompat
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.notificationPrefs
import cx.lpm.mobile.core.data.push.DeliveredNote
import cx.lpm.mobile.core.data.push.DeliveredNotes
import cx.lpm.mobile.core.data.push.LiveSnapshot
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushClear
import cx.lpm.mobile.core.data.push.PushCrypto
import cx.lpm.mobile.core.data.push.PushKind
import cx.lpm.mobile.core.data.push.PushRecap
import cx.lpm.mobile.core.data.push.PushReminder
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.widget.AgentWidgetStore
import cx.lpm.mobile.core.model.Project
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalTime
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject

/**
 * Turns an lpm push into a notification, the job iOS splits between its
 * notification service extension and app delegate: the Mac sends only a sealed
 * blob, which is opened here with the phone's push key and posted on the channel
 * of its kind, or — for a withdrawal — matched against what is still showing. A
 * live update goes to the agents-at-work card ([LiveNotifier]).
 */
@Singleton
class PushNotifier @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val credentials: CredentialStore,
    private val session: MacSession,
    private val widget: AgentWidgetStore,
    private val live: LiveNotifier,
    private val prefs: AppPreferences
) {
    private val manager = NotificationManagerCompat.from(context)

    fun createChannels() {
        manager.createNotificationChannelGroupsCompat(
            listOf(
                NotificationChannelGroupCompat.Builder(GROUP_AGENTS)
                    .setName(context.getString(R.string.push_group_agents))
                    .build(),
                NotificationChannelGroupCompat.Builder(GROUP_AUTOMATIONS)
                    .setName(context.getString(R.string.push_group_automations))
                    .build()
            )
        )
        manager.createNotificationChannelsCompat(
            PushKind.entries.map { kind ->
                NotificationChannelCompat.Builder(kind.channelId, kind.importance)
                    .setName(context.getString(kind.channelName))
                    .setGroup(kind.group)
                    .build()
            } + NotificationChannelCompat.Builder(
                LiveNotification.CHANNEL,
                NotificationManager.IMPORTANCE_LOW
            )
                .setName(context.getString(R.string.push_channel_live))
                .setGroup(GROUP_AGENTS)
                .setShowBadge(false)
                .build() +
                NotificationChannelCompat.Builder(
                    QUIET_CHANNEL,
                    NotificationManager.IMPORTANCE_LOW
                )
                    .setName(context.getString(R.string.push_channel_quiet))
                    .build() +
                NotificationChannelCompat.Builder(
                    REMINDER_CHANNEL,
                    NotificationManager.IMPORTANCE_DEFAULT
                )
                    .setName(context.getString(R.string.push_channel_reminders))
                    .build()
        )
    }

    /** One FCM data message, on the messaging service's worker thread. */
    fun handle(data: Map<String, String>) {
        val blob = data[BLOB] ?: return
        // A push can start the process before the app has loaded its stored keys.
        if (!credentials.isLoaded) runBlocking { credentials.load() }
        val key = credentials.loadPushKey() ?: return
        val payload = PushCrypto.open(blob, key) ?: return
        if (data[TYPE] == "liveactivity") return showLive(payload, ended = data[EVENT] == "end")
        if (data[TYPE] == "background") {
            PushClear.parse(payload)?.let { clear ->
                widget.apply(clear)
                withdraw(clear)
            }
            return
        }
        widget.apply(payload)
        PushRecap.parse(payload)?.let { return post(it, data[COLLAPSE_ID]) }
        PushReminder.parse(payload)?.let { return post(it, data[COLLAPSE_ID]) }
        val alert = PushAlert.parse(payload) ?: return
        // The open app shows its live Mac's statuses itself; a push from another
        // Mac, or from this one while the link is down, is news only it carries.
        if (appOnScreen() && session.showsLive(alert.serverId)) return
        post(alert, data[COLLAPSE_ID])
    }

    /** The Mac's own update of its agents at work, sent while the app is away from it. */
    private fun showLive(payload: JsonObject, ended: Boolean) {
        val pushed = LiveSnapshot.parse(payload)
        val snapshot = if (ended) pushed.ended() else pushed
        val macId = snapshot.serverId ?: return
        // The open app keeps its live Mac's card current itself.
        if (appOnScreen() && session.showsLive(macId)) return
        live.show(macId, snapshot, appOnScreen())
    }

    /** Withdraw the active Mac's notifications whose news is over. */
    fun reconcile(projects: List<Project>, activeServerId: String?) {
        DeliveredNotes.stale(delivered(), projects, activeServerId).forEach(::cancel)
    }

    private fun withdraw(clear: PushClear) {
        DeliveredNotes.cleared(delivered(), clear).forEach(::cancel)
    }

    private fun post(alert: PushAlert, collapseId: String?) {
        // A later status of the same pane replaces this one, like `apns-collapse-id`.
        val tag = collapseId ?: "${alert.serverId.orEmpty()}|${alert.project}|${alert.statusKey}"
        val quiet = quiets(alert.status)
        context.notifyIfAllowed(tag, AlertExtras.NOTIFICATION_ID) {
            context.alertNotification(alert, tag, quiet = quiet).build()
        }
    }

    private fun post(reminder: PushReminder, collapseId: String?) {
        val tag = collapseId ?: "${reminder.serverId.orEmpty()}|${reminder.key}"
        context.notifyIfAllowed(tag, AlertExtras.NOTIFICATION_ID) {
            context.reminderNotification(reminder, tag, quiets("")).build()
        }
    }

    /** In quiet hours a notification goes to the shade without a sound or heads-up. */
    private fun quiets(status: String): Boolean {
        if (!prefs.isLoaded) runBlocking { prefs.load() }
        return prefs.notificationPrefs.quiet.quiets(status, LocalTime.now())
    }

    private fun post(recap: PushRecap, collapseId: String?) {
        // One a week from each Mac; a second send of the same week replaces the first.
        val tag = collapseId ?: "${recap.serverId.orEmpty()}|${recap.key}"
        context.notifyIfAllowed(tag, AlertExtras.NOTIFICATION_ID) {
            context.recapNotification(recap, tag, quiets("")).build()
        }
    }

    private fun delivered(): List<DeliveredNote> = manager.activeNotifications.map { sbn ->
        val extras = sbn.notification.extras
        DeliveredNote(
            tag = sbn.tag,
            id = sbn.id,
            project = extras.getString(NotificationOpenTarget.PROJECT),
            statusKey = extras.getString(AlertExtras.STATUS_KEY),
            status = extras.getString(AlertExtras.STATUS),
            serverId = extras.getString(NotificationOpenTarget.SERVER_ID)
        )
    }

    private fun cancel(note: DeliveredNote) = manager.cancel(note.tag, note.id)

    companion object {
        /** The action a notification tap opens the app with. */
        const val ACTION_OPEN = "cx.lpm.mobile.action.OPEN_NOTIFICATION"

        private const val BLOB = "blob"
        private const val TYPE = "type"
        private const val EVENT = "event"
        private const val COLLAPSE_ID = "collapseId"
    }
}

private const val GROUP_AGENTS = "agents"
private const val GROUP_AUTOMATIONS = "automations"

private val PushKind.group: String?
    get() = when (this) {
        PushKind.Waiting, PushKind.Done, PushKind.Error -> GROUP_AGENTS

        PushKind.AutomationStarted, PushKind.AutomationDone, PushKind.AutomationError ->
            GROUP_AUTOMATIONS

        PushKind.WeeklyRecap -> null
    }

internal val PushKind.channelId: String
    get() = when (this) {
        PushKind.Waiting -> "agent-waiting"
        PushKind.Done -> "agent-done"
        PushKind.Error -> "agent-error"
        PushKind.AutomationStarted -> "automation-started"
        PushKind.AutomationDone -> "automation-done"
        PushKind.AutomationError -> "automation-error"
        PushKind.WeeklyRecap -> "weekly-recap"
    }

private val PushKind.channelName: Int
    get() = when (this) {
        PushKind.Waiting -> R.string.push_channel_waiting
        PushKind.Done -> R.string.push_channel_done
        PushKind.Error -> R.string.push_channel_error
        PushKind.AutomationStarted -> R.string.push_channel_automation_started
        PushKind.AutomationDone -> R.string.push_channel_automation_done
        PushKind.AutomationError -> R.string.push_channel_automation_error
        PushKind.WeeklyRecap -> R.string.push_channel_weekly_recap
    }

// What needs the user right now pops up; the rest arrives quietly in the shade.
internal val PushKind.importance: Int
    get() = when (this) {
        PushKind.Waiting, PushKind.Done, PushKind.Error, PushKind.AutomationError ->
            NotificationManager.IMPORTANCE_HIGH

        PushKind.AutomationStarted, PushKind.AutomationDone, PushKind.WeeklyRecap ->
            NotificationManager.IMPORTANCE_DEFAULT
    }
