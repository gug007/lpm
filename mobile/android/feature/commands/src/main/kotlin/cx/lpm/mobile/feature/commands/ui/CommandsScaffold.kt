package cx.lpm.mobile.feature.commands.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.GlassButtonGroup
import cx.lpm.mobile.core.designsystem.component.GlassGroupButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.commands.R

/**
 * A Commands page: the bar with [leading], [title] and "+" ([onNewCommand], none on a
 * page that only reads), over [content] that pulls to refresh. [beforeNewCommand] shares
 * the "+" button's glass capsule. [inSheet] drops the status bar inset for the room
 * under a sheet's grabber.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CommandsScaffold(
    title: String,
    leading: @Composable RowScope.() -> Unit,
    onNewCommand: (() -> Unit)?,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    inSheet: Boolean = false,
    newCommandEnabled: Boolean = true,
    beforeNewCommand: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit
) {
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemGroupedBackground)
    ) {
        LpmTopBar(
            title = title,
            modifier = if (inSheet) Modifier.padding(top = 16.dp) else Modifier,
            windowInsets = if (inSheet) WindowInsets(0) else WindowInsets.statusBars,
            leading = leading,
            trailing = {
                if (onNewCommand != null) {
                    val icon = painterResource(DesignR.drawable.ic_add)
                    val label = stringResource(R.string.commands_new_command)
                    if (beforeNewCommand == null) {
                        GlassIconButton(
                            icon = icon,
                            contentDescription = label,
                            onClick = onNewCommand,
                            enabled = newCommandEnabled,
                            iconSize = 30.dp
                        )
                    } else {
                        GlassButtonGroup {
                            beforeNewCommand()
                            GlassGroupButton(
                                icon = icon,
                                contentDescription = label,
                                onClick = onNewCommand,
                                enabled = newCommandEnabled,
                                iconSize = 30.dp
                            )
                        }
                    }
                }
            }
        )
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = onRefresh,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            content = content
        )
    }
}

/** A page's list insets: the grouped list's margins, with room below the last row. */
internal val CommandsListPadding = PaddingValues(
    start = ListDefaults.Margin,
    end = ListDefaults.Margin,
    top = ListDefaults.ContentTopPadding,
    bottom = 24.dp
)
