package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SlashCommand

/** Slash-command autocomplete over the field while a "/command" is typed; a row fills it in. */
@Composable
internal fun SlashMenu(
    commands: List<SlashCommand>,
    onPick: (SlashCommand) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    LazyColumn(modifier.heightIn(max = 220.dp)) {
        items(commands, key = { it.name }) { command ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onPick(command) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "/${command.name}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = colors.label,
                    maxLines = 1
                )
                if (command.argumentHint.isNotEmpty()) {
                    Text(
                        command.argumentHint,
                        fontSize = 12.sp,
                        color = colors.tertiaryLabel,
                        maxLines = 1
                    )
                }
                Spacer(Modifier.weight(1f))
                if (command.description.isNotEmpty()) {
                    Text(
                        text = command.description,
                        fontSize = 12.sp,
                        color = colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.End,
                        modifier = Modifier.widthIn(max = 180.dp)
                    )
                }
                command.sourceLabel?.let { source ->
                    Text(
                        text = source.uppercase(),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 0.6.sp,
                        color = colors.tertiaryLabel,
                        maxLines = 1
                    )
                }
            }
            ComposerDivider(alpha = 0.4f)
        }
    }
}
