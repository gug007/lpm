package cx.lpm.mobile.feature.automations.list

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.glass
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.automations.R

/**
 * The Automations list's Failed filter: "Failed" and how many rows it would keep,
 * tinted red while it's on, like the desktop's header button.
 */
@Composable
internal fun AutomationFailedToggle(
    count: Int,
    isOn: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val label = stringResource(R.string.automations_failed_label, count)
    val hint = stringResource(
        if (isOn) R.string.automations_failed_hint_on else R.string.automations_failed_hint_off
    )
    val style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.Medium)
    Box(
        modifier = modifier
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClickLabel = hint,
                role = Role.Button,
                onClick = onToggle
            )
            .semantics(mergeDescendants = true) {
                contentDescription = label
                selected = isOn
            }
            .height(44.dp)
            .glass(CircleShape, colors, pressed)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            modifier = Modifier
                .background(
                    if (isOn) colors.red.copy(alpha = 0.16f) else Color.Transparent,
                    CircleShape
                )
                .padding(horizontal = 10.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.automations_failed),
                style = style,
                color = colors.label
            )
            Text(
                text = "$count",
                style = style.copy(fontFeatureSettings = "tnum"),
                color = colors.red
            )
        }
    }
}
