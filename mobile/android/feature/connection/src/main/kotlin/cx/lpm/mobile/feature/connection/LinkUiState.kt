package cx.lpm.mobile.feature.connection

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.IssueCopy
import cx.lpm.mobile.core.data.link.LinkState
import cx.lpm.mobile.core.data.link.LinkView
import cx.lpm.mobile.core.data.link.issueCopy
import cx.lpm.mobile.core.data.session.MacSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/** How an issue is shown: the bar over a list, or a card in place of content. */
enum class IssueStyle { Bar, Card }

/** The link as the connection UI shows it: the derived view plus the store's own flags. */
@Immutable
data class LinkUiState(
    val view: LinkView,
    val link: LinkState,
    val isReady: Boolean,
    val demo: Boolean,
    val recoveryStatus: String?,
    val device: String
) {
    /**
     * The bar names the machine by kind; a card by its name. A machine that removed
     * this phone is named even in the bar: it can be one opened through another Mac,
     * which "your Mac" would read as.
     */
    fun content(issue: ConnectionIssue, style: IssueStyle): IssueContentState {
        val copy = issue.issueCopy(
            mac = if (style == IssueStyle.Card || issue == ConnectionIssue.RemovedOnMac) {
                view.macLabel
            } else {
                view.macNoun
            },
            device = device
        )
        val sent = link.wakeSentAt?.let { System.currentTimeMillis() - it < WAKE_NOTE_MS } == true
        return IssueContentState(
            issue = issue,
            copy = copy,
            recoveryStatus = recoveryStatus?.takeIf { issue.isConnecting },
            failure = link.tailscaleFailure,
            waitingCount = if (link.pairing) 0 else link.waitingCount,
            trying = link.trying,
            tailscaleWorking = link.tailscaleWorking,
            wakeSent = sent && IssueAction.Wake in copy.actions
        )
    }

    private companion object {
        const val WAKE_NOTE_MS = 60_000L
    }
}

/** One issue's words and buttons, with what the link adds to them right now. */
@Immutable
data class IssueContentState(
    val issue: ConnectionIssue,
    val copy: IssueCopy,
    /** "Found <name>, reconnecting…" while a connect is under way. */
    val recoveryStatus: String? = null,
    val failure: String? = null,
    val waitingCount: Int = 0,
    val trying: Boolean = false,
    val tailscaleWorking: Boolean = false,
    /** A wake signal went out in the last minute. */
    val wakeSent: Boolean = false
)

/** Follows `session`'s link for the connection UI. */
fun MacSession.linkUi(device: String): Flow<LinkUiState> =
    combine(link.views, link.state, state) { view, link, s ->
        LinkUiState(
            view = view,
            link = link,
            isReady = s.isReady,
            demo = s.demoMode,
            recoveryStatus = s.recoveryStatus,
            device = device
        )
    }
