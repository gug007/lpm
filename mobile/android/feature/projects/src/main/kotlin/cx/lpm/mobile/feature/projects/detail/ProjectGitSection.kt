package cx.lpm.mobile.feature.projects.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ListSectionSpacing
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.ui.CiStateIcon
import cx.lpm.mobile.core.ui.compactCount
import cx.lpm.mobile.feature.projects.R

/**
 * The project's Git under its tabs (iOS `ProjectGitSection`): the branch and how far it
 * is from its upstream, the uncommitted changes, and CI, each opening what the "…"
 * menu's items open. Nothing shows for a folder that isn't a repository.
 */
@Composable
internal fun ProjectGitSection(state: ProjectDetailUiState, actions: ProjectDetailActions) {
    val git = state.git?.takeIf { state.showsGit } ?: return
    ListSection(
        header = stringResource(R.string.detail_git),
        spacing = ListSectionSpacing.Compact
    ) {
        BranchRow(git, actions.openBranch)
        ChangesRow(git, actions.openChanges)
        state.checks?.let { checks -> ChecksRow(checks, actions.openChecks) }
    }
}

@Composable
private fun BranchRow(git: GitSnapshot, onClick: () -> Unit) {
    val ahead = git.ahead.takeIf { it > 0 }
    val behind = git.behind.takeIf { it > 0 }
    val spoken = listOfNotNull(
        ahead?.let { stringResource(R.string.detail_git_to_push, it) },
        behind?.let { stringResource(R.string.detail_git_to_pull, it) }
    ).joinToString(", ")
    GitSectionRow(
        title = if (git.detached) stringResource(R.string.detail_git_detached) else git.branch,
        monospaced = !git.detached,
        trailingSpoken = spoken,
        onOpen = onClick,
        leading = { RowIcon(DesignR.drawable.ic_call_split) }
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ahead?.let { TrailingText("↑$it") }
            behind?.let { TrailingText("↓$it") }
        }
    }
}

/** "+52 −5 · 4 files", or "None" for a clean tree. */
@Composable
private fun ChangesRow(git: GitSnapshot, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    val files = git.files.size
    val added = git.linesAdded ?: 0
    val removed = git.linesRemoved ?: 0
    val count = pluralStringResource(R.plurals.detail_git_files, files, files)
    val parts = listOfNotNull(
        "+${compactCount(added)}".takeIf { added > 0 },
        "−${compactCount(removed)}".takeIf { removed > 0 },
        if (added + removed > 0) "· $count" else count
    )
    val none = stringResource(R.string.detail_git_no_changes)
    GitSectionRow(
        title = stringResource(R.string.detail_git_changes),
        trailingSpoken = if (files == 0) none else parts.joinToString(" "),
        onOpen = onClick,
        leading = { RowIcon(DesignR.drawable.ic_checklist) }
    ) {
        if (files == 0) {
            TrailingText(none)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (added > 0) TrailingText("+${compactCount(added)}", colors.green)
                if (removed > 0) TrailingText("−${compactCount(removed)}", colors.red)
                TrailingText(parts.last())
            }
        }
    }
}

@Composable
private fun ChecksRow(checks: GitChecks, onClick: () -> Unit) {
    val verdict = checks.verdict ?: return
    val colors = LpmTheme.colors
    GitSectionRow(
        title = checks.pr?.let { stringResource(R.string.detail_git_ci_on, it.number) }
            ?: stringResource(R.string.ci_title),
        trailingSpoken = checks.label,
        onOpen = onClick,
        leading = { CiStateIcon(verdict, size = IconSize) }
    ) {
        TrailingText(
            checks.label,
            if (verdict == CiCheck.State.FAIL) colors.red else colors.secondaryLabel
        )
    }
}

/**
 * A full-width row: [leading] icon, [title], what's on the right, and a chevron, opening
 * [onOpen]. It reads as one line, the title then [trailingSpoken].
 */
@Composable
private fun GitSectionRow(
    title: String,
    trailingSpoken: String,
    onOpen: () -> Unit,
    leading: @Composable () -> Unit,
    monospaced: Boolean = false,
    trailing: @Composable RowScope.() -> Unit
) {
    val spoken = listOf(title, trailingSpoken).filter { it.isNotEmpty() }.joinToString(", ")
    val body = LpmTheme.typography.body
    ListRow(
        modifier = Modifier.clearAndSetSemantics {
            contentDescription = spoken
            role = Role.Button
            onClick {
                onOpen()
                true
            }
        },
        onClick = onOpen,
        leading = leading,
        leadingSlot = GitLeadingSlot,
        verticalPadding = 4.dp,
        trailing = {
            trailing()
            Spacer(Modifier.width(12.dp))
            DisclosureChevron()
        }
    ) {
        Text(
            text = title,
            style = if (monospaced) body.copy(fontFamily = FontFamily.Monospace) else body,
            color = LpmTheme.colors.label,
            maxLines = 1,
            overflow = TextOverflow.MiddleEllipsis,
            modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun TrailingText(text: String, color: Color = LpmTheme.colors.secondaryLabel) {
    Text(
        text = text,
        style = LpmTheme.typography.subheadline.copy(fontFeatureSettings = "tnum"),
        color = color,
        maxLines = 1
    )
}

@Composable
private fun RowIcon(drawable: Int) {
    Icon(
        painter = painterResource(drawable),
        contentDescription = null,
        tint = LpmTheme.colors.secondaryLabel,
        modifier = Modifier.size(IconSize)
    )
}

private val IconSize = 22.dp
private val GitLeadingSlot = ListLeadingSlot(width = 24.dp, spacing = 12.dp)
