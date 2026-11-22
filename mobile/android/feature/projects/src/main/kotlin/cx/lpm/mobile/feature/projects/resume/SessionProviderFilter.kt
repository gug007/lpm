package cx.lpm.mobile.feature.projects.resume

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.SegmentedControl
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.feature.projects.R

private val KnownProviders = listOf("claude", "codex", "gemini", "opencode", "cursor")

/**
 * The agents the filter offers (iOS `sessionFilterProviders`): Claude and Codex always, as
 * the list always has, then each other agent with sessions in [rows], in the desktop's
 * order, and the [selected] one even when a search has left it nothing.
 */
fun sessionFilterProviders(rows: List<String>, selected: String?): List<String> {
    val present = rows.toSet() + listOfNotNull(selected)
    val known = KnownProviders.filter { it == "claude" || it == "codex" || it in present }
    return known + (present - KnownProviders.toSet()).sorted()
}

/**
 * Resume Session's agent filter (iOS `SessionProviderFilter`): All, then one choice per
 * agent. Claude and Codex fit the segmented control the list has always had; once Gemini,
 * OpenCode or Cursor have sessions too, the choices become a row of chips that scrolls, so
 * no name gets cut short. [selection] is a provider key, null for All.
 */
@Composable
fun SessionProviderFilter(
    providers: List<String>,
    selection: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val all = stringResource(R.string.resume_all)
    if (providers.size <= 2) {
        SegmentedControl(
            options = listOf(all) + providers.map { providerMeta(it).short },
            selectedIndex = selection?.let { providers.indexOf(it) + 1 } ?: 0,
            onSelect = { onSelect(if (it == 0) null else providers[it - 1]) },
            modifier = modifier.padding(horizontal = 20.dp)
        )
        return
    }
    val label = stringResource(R.string.resume_agent)
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(PaddingValues(horizontal = 20.dp))
            .selectableGroup()
            .semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Chip(all, selection == null) { onSelect(null) }
        providers.forEach { p -> Chip(providerMeta(p).short, selection == p) { onSelect(p) } }
    }
}

@Composable
private fun Chip(text: String, on: Boolean, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    val haptics = LocalHapticFeedback.current
    val shape = CircleShape
    Box(
        modifier = Modifier
            .height(32.dp)
            .then(
                if (on) {
                    Modifier.dropShadow(
                        shape = shape,
                        shadow = Shadow(
                            radius = 3.dp,
                            color = Color.Black.copy(alpha = 0.12f),
                            offset = DpOffset(0.dp, 1.dp)
                        )
                    )
                } else {
                    Modifier
                }
            )
            .background(
                if (on) colors.secondarySystemGroupedBackground else colors.tertiarySystemFill,
                shape
            )
            .selectable(selected = on, role = Role.Tab) {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                onClick()
            }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = LpmTheme.typography.subheadline.copy(
                fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium
            ),
            color = colors.label
        )
    }
}
