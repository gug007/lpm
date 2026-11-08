package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.model.PendingShare
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sends what the share sheet kept for later, each to its Mac, oldest first (iOS
 * `AppModel.sendWaitingShares`). A share whose Mac is no longer saved is dropped, one
 * whose Mac still doesn't answer waits for next time (as do that Mac's later shares,
 * without dialling it again), and every other one is told about through `announce`
 * (with the Mac's refusal, or null once it got there) and dropped. Runs on the main
 * thread, one sweep at a time.
 */
@Singleton
class ShareOutbox @Inject constructor(
    private val inbox: ShareInbox,
    private val delivery: ShareDelivery
) {
    private var sending = false

    suspend fun sendWaiting(macs: List<MacRecord>, announce: (PendingShare, String?) -> Unit) {
        if (sending) return
        sending = true
        try {
            val unreachable = mutableSetOf<String>()
            for (share in inbox.all()) {
                if (share.serverId in unreachable) continue
                val mac = macs.firstOrNull { it.serverId == share.serverId && it.via == null }
                    ?.toShareMac()
                if (mac == null) {
                    inbox.remove(share)
                    continue
                }
                when (val outcome = delivery.send(share, inbox.images(share), mac)) {
                    ShareDelivery.Outcome.Unreachable -> {
                        unreachable += mac.serverId
                        continue
                    }

                    ShareDelivery.Outcome.Sent -> announce(share, null)

                    is ShareDelivery.Outcome.Failed -> announce(share, outcome.message)
                }
                inbox.remove(share)
            }
        } finally {
            sending = false
        }
    }
}
