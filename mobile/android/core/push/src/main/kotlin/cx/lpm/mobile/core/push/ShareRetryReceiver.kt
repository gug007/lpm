package cx.lpm.mobile.core.push

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cx.lpm.mobile.core.data.di.ApplicationScope
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.share.ShareInbox
import cx.lpm.mobile.core.data.share.ShareOutbox
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Retry on a share the Mac turned down (iOS `ShareInbox.retry`): it goes back in line
 * and the waiting shares are sent again, the broadcast held open meanwhile.
 */
@AndroidEntryPoint
class ShareRetryReceiver : BroadcastReceiver() {
    @Inject
    lateinit var retry: ShareRetry

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(SHARE_ID) ?: return
        val pending = goAsync()
        retry.retry(id, intent.getStringExtra(TAG)) { pending.finish() }
    }

    companion object {
        private const val SHARE_ID = "share.id"
        private const val TAG = "share.tag"

        fun intent(context: Context, id: String, tag: String): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                "$tag|retry".hashCode(),
                Intent(context, ShareRetryReceiver::class.java)
                    .putExtra(SHARE_ID, id)
                    .putExtra(TAG, tag),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
    }
}

@Singleton
class ShareRetry @Inject constructor(
    private val inbox: ShareInbox,
    private val outbox: ShareOutbox,
    private val session: MacSession,
    private val notices: ShareNotices,
    @param:ApplicationScope private val scope: CoroutineScope
) {
    internal fun retry(id: String, tag: String?, finished: () -> Unit) {
        tag?.let(notices::dismiss)
        scope.launch {
            try {
                inbox.retry(id)
                val state = session.state.value
                if (!state.demoMode) outbox.sendWaiting(state.macs, notices::show)
            } finally {
                finished()
            }
        }
    }
}
