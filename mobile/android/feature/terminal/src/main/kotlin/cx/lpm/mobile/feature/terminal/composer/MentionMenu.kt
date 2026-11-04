package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.MentionPlace
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.feature.terminal.R

/** What a row of the @-mention menu does. */
internal class MentionActions(
    val pickPath: (String) -> Unit,
    val pickBranch: (String) -> Unit,
    val pickPlace: (MentionPlace) -> Unit,
    /** Opens a mentioned file; null leaves the preview button out. */
    val previewFile: ((String) -> Unit)?,
    val pickTerminalOutput: () -> Unit,
    val pickServiceLog: (ServiceInfo) -> Unit
)

/**
 * The @-mention autocomplete, grouped like the desktop's: working-tree changes,
 * places on each other computer an agent here can reach, files and folders,
 * branches (once a fragment is typed), then context sources — this terminal's
 * output and each running service's logs, which go in inline.
 */
@Composable
internal fun MentionMenu(
    results: MentionResults,
    actions: MentionActions,
    modifier: Modifier = Modifier,
    includeTerminalOutput: Boolean = true
) {
    val changes = stringResource(R.string.mention_changes)
    val files = stringResource(R.string.mention_files)
    val branches = stringResource(R.string.mention_branches)
    val context = stringResource(R.string.mention_context)
    LazyColumn(modifier.heightIn(max = 260.dp)) {
        if (results.changed.isNotEmpty()) {
            header(changes)
            items(results.changed, key = { "c:" + it.path }) { PathRow(it, actions) }
        }
        results.computers.forEachIndexed { index, computer ->
            // iOS's MenuSectionHeading uppercases its title.
            header("${computer.name} · ${computer.access}".uppercase(), key = "m:$index")
            itemsIndexed(computer.places, key = { i, _ -> "m:$index:$i" }) { _, place ->
                ContextRow(
                    icon = DesignR.drawable.ic_desktop_mac,
                    title = place.label,
                    subtitle = place.path,
                    onClick = { actions.pickPlace(place) }
                )
            }
        }
        if (results.files.isNotEmpty()) {
            header(files)
            items(results.files, key = { "f:" + it.path }) { PathRow(it, actions) }
        }
        if (results.branches.isNotEmpty()) {
            header(branches)
            items(results.branches, key = { "b:" + it.id }) { BranchRow(it, actions) }
        }
        if (includeTerminalOutput || results.services.isNotEmpty()) header(context)
        if (includeTerminalOutput) {
            item(key = "terminal-output") {
                ContextRow(
                    icon = DesignR.drawable.ic_terminal,
                    title = stringResource(R.string.mention_terminal_output),
                    subtitle = stringResource(R.string.mention_terminal_output_subtitle),
                    onClick = actions.pickTerminalOutput
                )
            }
        }
        items(results.services, key = { "s:" + it.name }) { service ->
            ContextRow(
                icon = DesignR.drawable.ic_layers,
                title = stringResource(R.string.mention_service_logs, service.name),
                subtitle = stringResource(R.string.mention_service_logs_subtitle),
                onClick = { actions.pickServiceLog(service) }
            )
        }
    }
}

private fun LazyListScope.header(text: String, key: String = "h:$text") {
    item(key = key) {
        Text(
            text = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = LpmTheme.colors.tertiaryLabel,
            modifier = Modifier.fillMaxWidth().padding(
                start = 16.dp,
                end = 16.dp,
                top = 8.dp,
                bottom = 4.dp
            )
        )
    }
}

@Composable
private fun PathRow(entry: MentionEntry, actions: MentionActions) {
    val colors = LpmTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable { actions.pickPath(entry.path) }
                .padding(start = 16.dp, top = 9.dp, bottom = 9.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RowIcon(
                if (entry.dir) DesignR.drawable.ic_folder else DesignR.drawable.ic_description,
                colors.secondaryLabel
            )
            Text(
                text = entry.path,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace,
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.StartEllipsis,
                modifier = Modifier.weight(1f)
            )
            if (entry.changed) {
                Text(
                    stringResource(R.string.mention_changed),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.orange
                )
            }
        }
        // Files open a preview here instead of going into the prompt.
        val preview = actions.previewFile
        if (!entry.dir && preview != null) {
            Box(
                modifier = Modifier
                    .width(44.dp)
                    .clickable(role = Role.Button) { preview(entry.path) }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painterResource(DesignR.drawable.ic_visibility),
                    contentDescription = stringResource(R.string.mention_preview),
                    tint = colors.secondaryLabel,
                    modifier = Modifier.size(17.dp)
                )
            }
        } else {
            Spacer(Modifier.width(16.dp))
        }
    }
    ComposerDivider(alpha = 0.4f)
}

@Composable
private fun BranchRow(branch: GitBranch, actions: MentionActions) {
    val colors = LpmTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { actions.pickBranch(branch.name) }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RowIcon(
            if (branch.isRemote) DesignR.drawable.ic_call_split else DesignR.drawable.ic_fork_right,
            colors.secondaryLabel
        )
        Text(
            text = branch.name,
            fontSize = 14.sp,
            fontFamily = FontFamily.Monospace,
            color = colors.label,
            maxLines = 1,
            overflow = TextOverflow.StartEllipsis,
            modifier = Modifier.weight(1f)
        )
        if (branch.isRemote) Text(branch.remote, fontSize = 11.sp, color = colors.tertiaryLabel)
    }
    ComposerDivider(alpha = 0.4f)
}

@Composable
private fun ContextRow(icon: Int, title: String, subtitle: String, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RowIcon(icon, colors.tint)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                title,
                fontSize = 14.sp,
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                subtitle,
                fontSize = 11.sp,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis
            )
        }
        Spacer(Modifier.width(8.dp))
    }
    ComposerDivider(alpha = 0.4f)
}

@Composable
private fun RowIcon(icon: Int, tint: Color) {
    Box(Modifier.width(18.dp), contentAlignment = Alignment.Center) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(17.dp)
        )
    }
}
