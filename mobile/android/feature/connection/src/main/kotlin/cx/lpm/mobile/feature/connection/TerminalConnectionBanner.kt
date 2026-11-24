package cx.lpm.mobile.feature.connection

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.clockStamp
import cx.lpm.mobile.core.data.link.issueCopy
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SessionKey
import java.time.Instant

/**
 * Floating capsule over a terminal while the link is down: keystrokes and scroll
 * are dropped during a gap, so this is what says the frozen screen is the
 * connection and not a hung app. Same issue as the bar, with its first fix.
 */
@Composable
fun TerminalConnectionBanner(
    issue: ConnectionIssue,
    macLabel: String,
    device: String,
    onAction: (IssueAction) -> Unit,
    modifier: Modifier = Modifier,
    canOpenLpm: Boolean = false,
    lastSeen: Instant? = null
) {
    val copy = issue.issueCopy(macLabel, device, canOpenLpm = canOpenLpm)
    val action = copy.actions.firstOrNull { it != IssueAction.Details }
    val style = LpmTheme.typography.footnote
    Row(
        modifier = modifier
            .padding(horizontal = 16.dp)
            .background(Color.Black.copy(alpha = 0.6f), CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (issue.isConnecting) {
            ActivityIndicator(size = ActivityIndicatorSize.Small, color = Color.White)
            Words(stringResource(R.string.banner_reconnecting), lastSeen)
        } else {
            Icon(
                painter = painterResource(issueIcon(copy.icon)),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp)
            )
            Words(copy.title, lastSeen, Modifier.weight(1f, fill = false))
            if (action != null) {
                LinkButton(
                    text = action.label(issue),
                    onClick = { onAction(action) },
                    color = Color.White,
                    textStyle = style.copy(fontWeight = FontWeight.SemiBold)
                )
            }
        }
    }
}

/** What's wrong, and when what's on screen was kept, while it isn't live. */
@Composable
private fun Words(title: String, lastSeen: Instant?, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Text(
            text = title,
            style = LpmTheme.typography.footnote,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (lastSeen != null) {
            Text(
                text = stringResource(
                    R.string.banner_last_seen,
                    lastSeen.clockStamp(Instant.now())
                ),
                style = LpmTheme.typography.caption1,
                color = Color.White.copy(alpha = 0.75f),
                maxLines = 1
            )
        }
    }
}

/** [TerminalConnectionBanner] for `session`'s link, shown while it isn't ready. */
@Composable
fun TerminalConnectionBannerRoute(
    modifier: Modifier = Modifier,
    session: SessionKey = SessionKey.Live,
    lastSeen: Instant? = null
) {
    val viewModel = linkViewModel(session)
    val ui by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val state = ui ?: return
    val issue = state.view.issue ?: ConnectionIssue.Connecting(null)
    TerminalConnectionBanner(
        issue = issue,
        macLabel = state.view.macLabel,
        device = state.device,
        canOpenLpm = state.canOpenLpm,
        lastSeen = lastSeen,
        modifier = modifier,
        onAction = { context.performIssueAction(it, issue, viewModel::perform) }
    )
}
