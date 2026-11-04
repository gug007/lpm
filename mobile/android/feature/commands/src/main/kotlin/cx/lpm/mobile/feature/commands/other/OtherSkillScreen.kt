package cx.lpm.mobile.feature.commands.other

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.OtherSpot
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.OtherSkillKey
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.ui.BackButton
import cx.lpm.mobile.feature.commands.ui.CommandsListPadding
import cx.lpm.mobile.feature.commands.ui.CommandsScaffold
import cx.lpm.mobile.feature.commands.ui.rememberCommandsPage

/** One other skill pushed over its list. */
@Composable
fun OtherSkillRoute(key: OtherSkillKey, onBack: () -> Unit, modifier: Modifier = Modifier) {
    OtherSkillHost(
        project = key.project,
        scope = key.scope,
        name = key.name,
        session = key.session,
        onClose = onBack,
        leading = { BackButton(onBack) },
        modifier = modifier
    )
}

/** A skill not made in lpm: what it does and which agents can use it, to read only. */
@Composable
internal fun OtherSkillHost(
    project: String,
    scope: CommandScope,
    name: String,
    session: SessionKey,
    onClose: () -> Unit,
    leading: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    inSheet: Boolean = false,
    viewModel: OtherSkillsViewModel =
        hiltViewModel<OtherSkillsViewModel, OtherSkillsViewModel.Factory>(
            key = "other-skills:$project:${scope.wire}",
            creationCallback = { it.create(project, scope, session) }
        )
) {
    val list by viewModel.list.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val page = rememberCommandsPage(viewModel.watch)
    CommandsScaffold(
        title = "/$name",
        leading = leading,
        onNewCommand = null,
        refreshing = page.refreshing,
        onRefresh = page::refresh,
        modifier = modifier,
        inSheet = inSheet
    ) {
        list.others.firstOrNull { it.name == name }?.let { skill ->
            OtherSkillDetail(
                skill = skill,
                folders = list.folders,
                canChange = viewModel.canChange,
                onMove = { viewModel.move(name, it) },
                onConvert = { viewModel.convert(name, onClose) }
            )
        }
    }
    error?.let { message ->
        LpmAlert(
            title = stringResource(R.string.commands_change_failed),
            message = message,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = viewModel::dismissError
        )
    }
}

@Composable
internal fun OtherSkillDetail(
    skill: OtherSkill,
    folders: List<String>,
    canChange: Boolean,
    onMove: (OtherSpot) -> Unit,
    onConvert: () -> Unit
) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = CommandsListPadding,
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        if (skill.description.isNotEmpty()) {
            item(key = "description") {
                ListCard { ListRow { Text(skill.description, style = LpmTheme.typography.body) } }
            }
        }
        if (canChange) {
            item(key = "folder") { ListCard { FolderRow(skill, folders, onMove) } }
        }
        item(key = "agents") { Agents(skill) }
        if (skill.preview.isNotEmpty()) {
            item(key = "instructions") {
                Labeled(stringResource(R.string.commands_other_instructions)) {
                    Mono(skill.preview, LpmTheme.typography.footnote)
                }
            }
        }
        item(key = "path") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ListCard { Mono(skill.path, LpmTheme.typography.caption1) }
                Text(
                    text = stringResource(R.string.commands_other_read_only),
                    style = LpmTheme.typography.footnote,
                    color = LpmTheme.colors.secondaryLabel,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
        }
        if (canChange) {
            item(key = "convert") {
                ListCard {
                    ListRow(onClick = onConvert) {
                        Text(
                            text = stringResource(R.string.commands_other_convert),
                            style = LpmTheme.typography.body,
                            color = LpmTheme.colors.tint
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FolderRow(skill: OtherSkill, folders: List<String>, onMove: (OtherSpot) -> Unit) {
    val noFolder = stringResource(R.string.commands_no_folder)
    val otherSkills = stringResource(R.string.commands_other_skills)
    PickerRow(
        title = stringResource(R.string.command_editor_folder),
        options = folders.map { OtherSpot(it) } + OtherSpot(root = true) + OtherSpot(),
        selected = skill.spot,
        onSelect = onMove,
        optionLabel = { it.folder ?: if (it.root) noFolder else otherSkills }
    )
}

@Composable
private fun Agents(skill: OtherSkill) {
    val colors = LpmTheme.colors
    Labeled(stringResource(R.string.commands_other_works_in)) {
        skill.reach.forEach { agent ->
            ListRow(
                trailing = {
                    if (agent.reads) {
                        Icon(
                            painterResource(DesignR.drawable.ic_check),
                            contentDescription = stringResource(R.string.commands_other_works),
                            tint = colors.green,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            ) {
                Text(
                    text = agent.label,
                    style = LpmTheme.typography.body,
                    color = if (agent.reads) colors.label else colors.secondaryLabel
                )
            }
        }
    }
}

@Composable
private fun Labeled(label: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = LpmTheme.typography.footnote,
            color = LpmTheme.colors.secondaryLabel,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        ListCard { content() }
    }
}

@Composable
private fun Mono(text: String, style: androidx.compose.ui.text.TextStyle) {
    ListRow {
        SelectionContainer {
            Text(
                text = text,
                style = style.copy(fontFamily = FontFamily.Monospace),
                color = LpmTheme.colors.secondaryLabel
            )
        }
    }
}
