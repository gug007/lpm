package cx.lpm.mobile.core.push

import android.content.Context
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cx.lpm.mobile.core.model.PendingShare
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * How a share kept for later went once the app sent it (iOS
 * `AppModel.announce(_:failure:)`): "Sent to <project>", or "Couldn't send to
 * <project>" with the Mac's reason and Retry, which sends it again. A tap opens the app.
 */
@Singleton
class ShareNotices @Inject constructor(@param:ApplicationContext private val context: Context) {
    fun show(share: PendingShare, failure: String?) {
        val title = if (failure == null) {
            context.getString(R.string.share_sent_title, share.projectTitle)
        } else {
            context.getString(R.string.share_failed_title, share.projectTitle)
        }
        val body = failure ?: context.getString(R.string.share_sent_body, share.macName)
        val tag = "share-${share.id}"
        context.notifyIfAllowed(tag, NOTIFICATION_ID) {
            val builder = NotificationCompat.Builder(context, SHARES_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_lpm)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(context.openIntent(tag.hashCode(), Bundle()))
            if (failure != null) {
                builder.addAction(
                    NotificationCompat.Action.Builder(
                        null,
                        context.getString(R.string.share_retry),
                        ShareRetryReceiver.intent(context, share.id, tag)
                    ).build()
                )
            }
            builder.build()
        }
    }

    /** The notification about a share, once Retry has taken it back. */
    fun dismiss(tag: String) {
        NotificationManagerCompat.from(context).cancel(tag, NOTIFICATION_ID)
    }

    private companion object {
        const val NOTIFICATION_ID = 3
    }
}
