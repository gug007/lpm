package cx.lpm.mobile.feature.commands.folder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.ui.lpmCommandTint

/** One lpm command in a list: `/name` in lpm's accent over what it does. Tapping edits it. */
@Composable
internal fun CommandRow(command: LpmCommand, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val typography = LpmTheme.typography
    ListRow(modifier = modifier, onClick = onClick, verticalPadding = 10.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.Bottom,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = "/${command.name}",
                        style = typography.subheadline.copy(
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold
                        ),
                        color = lpmCommandTint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (command.argumentHint.isNotEmpty()) {
                        Text(
                            text = command.argumentHint,
                            style = typography.caption1.copy(fontFamily = FontFamily.Monospace),
                            color = colors.tertiaryLabel,
                            maxLines = 1
                        )
                    }
                }
                command.runsLabel(System.currentTimeMillis())?.let { runs ->
                    Text(
                        text = runs,
                        style = typography.caption2.copy(fontFeatureSettings = "tnum"),
                        color = colors.tertiaryLabel,
                        maxLines = 1
                    )
                }
            }
            val summary = command.summary
            if (summary.isNotEmpty()) {
                Text(
                    text = summary,
                    style = typography.caption1,
                    color = colors.secondaryLabel,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

/** The line shown under the name: its description, else the prompt's first line. */
internal val LpmCommand.summary: String
    get() = description.ifEmpty { body.lineSequence().firstOrNull { it.isNotEmpty() }.orEmpty() }
