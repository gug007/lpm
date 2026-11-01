package cx.lpm.mobile.feature.mac.keepawake

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.NavigationRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.ui.tickingNow
import cx.lpm.mobile.feature.mac.R
import java.time.Instant
import java.time.ZoneId

/** The connection sheet's "Keep awake" section for `session`'s Mac. */
@Composable
fun KeepAwakeSectionRoute(session: SessionKey = SessionKey.Live, onCustomTime: () -> Unit) {
    val viewModel = keepAwakeViewModel(session)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    KeepAwakeSection(state, onSet = viewModel::set, onCustomTime = onCustomTime)
}

/**
 * Keep awake in the Mac's connection details: what holds it now and every way to
 * change it, as its own Keep awake menu offers (iOS `KeepAwakeSection`).
 */
@Composable
fun KeepAwakeSection(
    state: KeepAwakeUiState,
    onSet: (MacKeepAwake.Mode, Int?) -> Unit,
    onCustomTime: () -> Unit,
    modifier: Modifier = Modifier
) {
    val keepAwake = state.offered ?: return
    val now = Instant.ofEpochMilli(tickingNow(state.keepAwake.endsAt != null))
    val colors = LpmTheme.colors
    val macName = state.macLabel.ifEmpty { stringResource(R.string.keep_awake_your_mac) }
    ListSection(
        modifier = modifier,
        header = stringResource(R.string.keep_awake_section),
        headerStyle = ListHeaderStyle.Title,
        footer = footer(keepAwake, macName)
    ) {
        ListRow(leading = {
            val off = keepAwake.mode == MacKeepAwake.Mode.Off
            val icon = if (keepAwake.isOn) {
                DesignR.drawable.ic_coffee_fill
            } else {
                DesignR.drawable.ic_coffee
            }
            Icon(
                painter = painterResource(icon),
                contentDescription = null,
                tint = if (off) colors.secondaryLabel else colors.orange,
                modifier = Modifier.size(22.dp)
            )
        }) {
            Text(
                text = keepAwake.line(
                    state.keepAwake.leftSeconds(now),
                    now,
                    ZoneId.systemDefault()
                ),
                style = LpmTheme.typography.body,
                color = colors.label
            )
        }
        val mode = keepAwake.mode
        Choice(stringResource(R.string.keep_awake_off), mode == MacKeepAwake.Mode.Off) {
            onSet(MacKeepAwake.Mode.Off, null)
        }
        Choice(stringResource(R.string.keep_awake_agents), mode == MacKeepAwake.Mode.Agents) {
            onSet(MacKeepAwake.Mode.Agents, null)
        }
        SetTime(checked = mode == MacKeepAwake.Mode.Timed) { onSet(MacKeepAwake.Mode.Timed, it) }
        NavigationRow(title = stringResource(R.string.keep_awake_custom), onClick = onCustomTime)
        Choice(stringResource(R.string.keep_awake_always), mode == MacKeepAwake.Mode.Always) {
            onSet(MacKeepAwake.Mode.Always, null)
        }
        state.keepAwake.error?.let { error ->
            ListRow {
                Text(text = error, style = LpmTheme.typography.footnote, color = colors.red)
            }
        }
    }
}

@Composable
private fun footer(keepAwake: MacKeepAwake, macName: String): String {
    val lid = stringResource(R.string.keep_awake_lid)
    keepAwake.powerNote(macName)?.let { return "$it $lid" }
    if (keepAwake.mode == MacKeepAwake.Mode.Agents) {
        return "${stringResource(R.string.keep_awake_counts, macName)} $lid"
    }
    return lid
}

@Composable
private fun Choice(title: String, checked: Boolean, onClick: () -> Unit) {
    ListRow(onClick = onClick, trailing = { if (checked) Check() }) {
        Text(text = title, style = LpmTheme.typography.body, color = LpmTheme.colors.label)
    }
}

@Composable
private fun Check() {
    Icon(
        painter = painterResource(DesignR.drawable.ic_check),
        contentDescription = stringResource(R.string.keep_awake_selected),
        tint = LpmTheme.colors.tint,
        modifier = Modifier.size(22.dp)
    )
}

/** "For a set time": a menu of the presets. */
@Composable
private fun SetTime(checked: Boolean, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ListRow(onClick = { open = true }, trailing = {
        Box {
            if (checked) {
                Check()
            } else {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_unfold_more),
                    contentDescription = null,
                    tint = LpmTheme.colors.tertiaryLabel,
                    modifier = Modifier.size(18.dp)
                )
            }
            ContextMenu(expanded = open, onDismissRequest = { open = false }) {
                MacKeepAwake.PRESETS.forEach { minutes ->
                    ContextMenuItem(
                        title = MacKeepAwake.presetTitle(minutes),
                        onClick = { onPick(minutes) }
                    )
                }
            }
        }
    }) {
        Text(
            text = stringResource(R.string.keep_awake_timed),
            style = LpmTheme.typography.body,
            color = LpmTheme.colors.label
        )
    }
}
