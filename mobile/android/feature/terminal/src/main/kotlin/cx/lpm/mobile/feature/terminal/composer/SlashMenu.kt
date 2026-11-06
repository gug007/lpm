package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.core.ui.lpmCommandTint
import cx.lpm.mobile.feature.terminal.R

/**
 * Slash-command autocomplete over the field while a "/command" is typed. A lone "/"
 * leads with the commands run most, whoever made them, then lists every other one A–Z.
 * A row picks its command; "Manage commands", when given, opens the Commands screen.
 */
@Composable
internal fun SlashMenu(
    commands: List<SlashCommand>,
    onPick: (SlashCommand) -> Unit,
    modifier: Modifier = Modifier,
    onManage: (() -> Unit)? = null,
    maxHeight: Dp = 220.dp
) {
    val headings = slashHeadings(commands)
    Column(modifier) {
        // The rows' own height, up to [maxHeight], taken from the terminal above.
        LazyColumn(Modifier.heightIn(max = maxHeight)) {
            itemsIndexed(commands, key = { _, it -> it.key }) { index, command ->
                Column {
                    headings[index]?.let { SlashHeading(it) }
                    SlashRow(command, onPick)
                    ComposerDivider(alpha = 0.4f)
                }
            }
        }
        if (onManage != null) {
            ComposerDivider(alpha = 0.5f)
            ManageCommandsRow(onManage)
        }
    }
}

/**
 * The heading each row starts: Most used over the rows it marks, and All over the rest.
 * None while typing, or before anything has run.
 */
@Composable
private fun slashHeadings(commands: List<SlashCommand>): List<String?> {
    val top = commands.count { it.mostUsed }
    if (top == 0) return commands.map { null }
    val mostUsed = stringResource(R.string.composer_slash_most_used)
    val all = stringResource(R.string.composer_slash_all, commands.size - top)
    return commands.indices.map { i ->
        when (i) {
            0 -> mostUsed
            top -> all
            else -> null
        }
    }
}

@Composable
private fun SlashHeading(text: String) {
    Text(
        text = text.uppercase(),
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.6.sp,
        color = LpmTheme.colors.tertiaryLabel,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 2.dp)
    )
}

@Composable
private fun SlashRow(command: SlashCommand, onPick: (SlashCommand) -> Unit) {
    val colors = LpmTheme.colors
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
            color = if (command.isLpm) lpmCommandTint else colors.label,
            maxLines = 1
        )
        Text(
            text = command.description,
            fontSize = 12.sp,
            color = colors.secondaryLabel,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f)
        )
        command.tag(
            stringResource(R.string.composer_slash_this_project),
            stringResource(R.string.composer_slash_global)
        )?.let { tag ->
            Text(
                text = tag,
                fontSize = 10.sp,
                color = colors.tertiaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 80.dp)
            )
        }
    }
}

@Composable
private fun ManageCommandsRow(onManage: () -> Unit) {
    val color = LpmTheme.colors.secondaryLabel
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onManage)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painterResource(DesignR.drawable.ic_tune),
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(14.dp)
        )
        Text(stringResource(R.string.composer_slash_manage), fontSize = 13.sp, color = color)
    }
}
