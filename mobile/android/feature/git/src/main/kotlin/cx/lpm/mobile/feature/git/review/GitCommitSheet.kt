package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.component.ValueRow
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.ui.SheetBar

/** What the commit sheet's controls do. */
class CommitActions(
    val setMessage: (String) -> Unit = {},
    val generateMessage: () -> Unit = {},
    val toggleSelected: (String) -> Unit = {},
    val selectAll: (Boolean) -> Unit = {},
    val commit: () -> Unit = {},
    val commitAndPush: () -> Unit = {}
)

/** A page of the commit sheet: the form, or the files pushed from its Files row. */
private enum class CommitPage { Form, Files }

/**
 * The commit sheet (iOS `GitCommitSheet`), the phone's take on the desktop's Commit
 * dialog: the message, which the Mac drafts from the diff as the sheet opens when
 * there's none yet, a Files row opening the list of changed files to include or
 * leave out, the branch and where it pushes, then Commit and Push or Commit only.
 * The message and selection live with the review, so closing the sheet keeps the
 * draft; a commit that lands (with its push, if it pushes) closes it.
 */
@Composable
internal fun GitCommitSheet(
    state: GitReviewUiState,
    actions: CommitActions,
    secrets: SecretCheck,
    onDismiss: () -> Unit
) {
    DisposableEffect(secrets) { onDispose(secrets::closed) }
    val sheet = rememberModalSheetState()
    val pages = rememberSheetNavigator(CommitPage.Form)
    val opened = remember { state.commitTick }
    val committed = state.commitTick != opened
    // A push that failed after its commit closes the sheet once its alert is read.
    LaunchedEffect(committed, state.opError) {
        if (committed && state.opError == null) sheet.dismiss(onDismiss)
    }
    ModalSheet(onDismissRequest = onDismiss, state = sheet) {
        SheetStack(pages, Modifier.weight(1f)) { page ->
            when (page) {
                CommitPage.Form -> CommitFormPage(
                    state = state,
                    actions = actions,
                    secrets = secrets,
                    onCancel = { sheet.dismiss(onDismiss) },
                    onFiles = { pages.push(CommitPage.Files) }
                )

                CommitPage.Files -> CommitFilesPage(
                    files = state.commitFiles,
                    onToggle = actions.toggleSelected,
                    onSelectAll = actions.selectAll,
                    onBack = pages::back
                )
            }
        }
    }
}

@Composable
private fun CommitFormPage(
    state: GitReviewUiState,
    actions: CommitActions,
    secrets: SecretCheck,
    onCancel: () -> Unit,
    onFiles: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
    ) {
        SheetBar(
            title = stringResource(R.string.git_commit_title),
            leading = {
                GlassCapsuleButton(text = stringResource(R.string.cancel), onClick = onCancel)
            }
        )
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
        ) {
            if (state.findings.isNotEmpty()) SecretFindingsSection(state.findings, secrets)
            if (state.conflicted.isNotEmpty()) ConflictSection(state.conflicted)
            ListSection {
                TextFieldRow(
                    value = state.message,
                    onValueChange = actions.setMessage,
                    placeholder = stringResource(R.string.git_commit_message),
                    minLines = 3,
                    maxLines = 8
                )
                CommitDraftRow(
                    generating = state.generating,
                    drafted = state.drafted,
                    canGenerate = state.selectedCount > 0,
                    onGenerate = actions.generateMessage
                )
            }
            ListSection {
                FilesRow(state.commitFiles, onClick = onFiles)
                state.branch?.let {
                    ValueRow(
                        title = stringResource(R.string.git_commit_branch),
                        value = stringResource(R.string.git_commit_branch_target, it)
                    )
                }
            }
        }
        if (state.findings.isEmpty()) {
            CommitButtons(
                busy = state.busy,
                enabled = state.canCommit,
                onCommitAndPush = actions.commitAndPush,
                onCommitOnly = actions.commit
            )
        } else {
            SecretFindingsButtons(state, secrets)
        }
    }
}

/** "Files  4 of 4 · +52 −5 ›": the files going in and the lines they change, once parsed. */
@Composable
private fun FilesRow(files: List<CommitFile>, onClick: () -> Unit) {
    val chosen = files.filter { it.selected }
    val added = chosen.sumOf { it.added ?: 0 }
    val removed = chosen.sumOf { it.removed ?: 0 }
    val style = LpmTheme.typography.body.copy(fontFeatureSettings = "tnum")
    val secondary = LpmTheme.colors.secondaryLabel
    ListRow(
        onClick = onClick,
        trailing = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.git_commit_files_count, chosen.size, files.size),
                    style = style,
                    color = secondary,
                    maxLines = 1
                )
                if (added > 0 || removed > 0) {
                    Text(text = "·", style = style, color = secondary)
                    DiffStat(added, removed)
                }
            }
            Spacer(Modifier.width(13.dp))
            DisclosureChevron()
        }
    ) {
        Text(
            text = stringResource(R.string.git_commit_files),
            style = LpmTheme.typography.body,
            modifier = Modifier.weight(1f),
            maxLines = 1
        )
    }
}

/** The desktop's ConflictNotice: which files still have merge conflicts. */
@Composable
private fun ConflictSection(paths: List<String>) {
    val named = if (paths.size > SHOWN_CONFLICTS) {
        stringResource(
            R.string.git_commit_conflicts_more,
            paths.take(SHOWN_CONFLICTS).joinToString(", "),
            paths.size - SHOWN_CONFLICTS
        )
    } else {
        paths.joinToString(", ")
    }
    ListSection {
        ListRow(
            leadingSlot = ListLeadingSlot(width = 20.dp, spacing = 12.dp),
            leading = {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_warning_fill),
                    contentDescription = null,
                    tint = LpmTheme.colors.red,
                    modifier = Modifier.size(18.dp)
                )
            }
        ) {
            Text(
                text = pluralStringResource(R.plurals.git_commit_conflicts, paths.size, named),
                style = LpmTheme.typography.footnote,
                color = LpmTheme.colors.red
            )
        }
    }
}

private const val SHOWN_CONFLICTS = 3
