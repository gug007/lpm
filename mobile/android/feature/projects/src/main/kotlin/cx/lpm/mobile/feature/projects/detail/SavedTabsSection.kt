package cx.lpm.mobile.feature.projects.detail

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.clockStamp
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ListSectionSpacing
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.ui.EmojiLabel
import cx.lpm.mobile.feature.projects.R
import java.time.Instant

/**
 * A project's agent tabs while the Mac is away, as this phone last had them (iOS
 * `SavedAgentTabsSection`): they open read-only.
 */
@Composable
internal fun SavedTabsSection(
    saved: SavedTabs,
    onOpen: (TerminalInfo) -> Unit,
    modifier: Modifier = Modifier
) {
    ListSection(
        modifier = modifier,
        header = stringResource(R.string.detail_tabs),
        footer = saved.lastSeen?.let {
            stringResource(
                R.string.detail_saved_tabs_seen,
                it.clockStamp(Instant.now()),
                saved.macLabel
            )
        } ?: stringResource(R.string.detail_saved_tabs, saved.macLabel),
        spacing = ListSectionSpacing.Compact
    ) {
        saved.tabs.forEach { tab ->
            key(tab.tabKey) {
                ListRow(
                    onClick = { onOpen(tab) },
                    trailing = {
                        Spacer(Modifier.width(8.dp))
                        DisclosureChevron()
                    }
                ) {
                    EmojiLabel(
                        emoji = tab.emoji,
                        label = tab.label,
                        fontSize = LpmTheme.typography.body.fontSize,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(
                            text = it,
                            style = LpmTheme.typography.body,
                            color = LpmTheme.colors.label,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}
