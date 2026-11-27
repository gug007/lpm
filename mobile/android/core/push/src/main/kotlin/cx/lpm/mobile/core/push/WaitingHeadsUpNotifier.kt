package cx.lpm.mobile.core.push

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushKind
import cx.lpm.mobile.core.data.push.WaitingBanner
import cx.lpm.mobile.core.data.push.WaitingHeadsUp
import cx.lpm.mobile.core.data.session.MacSession
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

/**
 * Shows [WaitingHeadsUp]'s banner over the open app: a heads-up on the Waiting channel
 * under one tag, so a newer one replaces the older. It carries what a Waiting push
 * does, so a tap opens the newest wait's tab and the reconcile withdraws it once that
 * wait ends.
 */
@Singleton
class WaitingHeadsUpNotifier @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val session: MacSession,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    private val manager = NotificationManagerCompat.from(context)

    @OptIn(ExperimentalCoroutinesApi::class)
    fun start() {
        scope.launch { session.store<WaitingHeadsUp>().banner.collect(::show) }
        // A machine opened from the list tells of its own agents, until it closes.
        scope.launch {
            session.visitSession
                .flatMapLatest { visit ->
                    visit?.store<WaitingHeadsUp>()?.banner?.drop(1) ?: flowOf(null)
                }
                .collect(::show)
        }
    }

    internal fun show(banner: WaitingBanner?) {
        if (banner == null) return manager.cancel(TAG, AlertExtras.NOTIFICATION_ID)
        val newest = banner.newest
        val count = banner.waits.size
        val alert = PushAlert(
            serverId = banner.serverId,
            project = newest.project,
            title = if (count == 1) {
                newest.projectLabel
            } else {
                context.resources.getQuantityString(R.plurals.heads_up_agents, count, count)
            },
            body = when {
                count > 1 -> banner.lines.joinToString(", ")
                newest.terminal.isEmpty() -> context.getString(R.string.heads_up_an_agent)
                else -> context.getString(R.string.heads_up_needs_you, newest.terminal)
            },
            kind = PushKind.Waiting,
            target = "terminal",
            terminalId = newest.terminalId,
            automationId = null,
            statusKey = newest.key,
            status = "Waiting"
        )
        context.notifyIfAllowed(TAG, AlertExtras.NOTIFICATION_ID) {
            context.alertNotification(alert, TAG, answers = false)
                .setSilent(!banner.alert)
                .build()
        }
    }

    internal companion object {
        const val TAG = "lpm.inapp.waiting"
    }
}
