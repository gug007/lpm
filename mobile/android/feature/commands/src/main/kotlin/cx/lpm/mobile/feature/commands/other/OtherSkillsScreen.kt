package cx.lpm.mobile.feature.commands.other

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.OtherSkill
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.OtherSkillKey
import cx.lpm.mobile.core.navigation.OtherSkillsKey
import cx.lpm.mobile.feature.commands.R
import cx.lpm.mobile.feature.commands.ui.BackButton
import cx.lpm.mobile.feature.commands.ui.CommandsListPadding
import cx.lpm.mobile.feature.commands.ui.CommandsScaffold
import cx.lpm.mobile.feature.commands.ui.rememberCommandsPage

/** A list's other skills pushed over the Commands screen. */
@Composable
fun OtherSkillsRoute(
    key: OtherSkillsKey,
    onOpen: (OtherSkillKey) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    OtherSkillsHost(
        project = key.project,
        scope = key.scope,
        session = key.session,
        onOpen = { onOpen(OtherSkillKey(key.project, key.scope, it, key.session)) },
        leading = { BackButton(onBack) },
        modifier = modifier
    )
}

/** The skills not made in lpm in one list's places, in no folder. Tapping one reads it. */
@Composable
internal fun OtherSkillsHost(
    project: String,
    scope: CommandScope,
    session: SessionKey,
    onOpen: (name: String) -> Unit,
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
    val page = rememberCommandsPage(viewModel.watch)
    CommandsScaffold(
        title = stringResource(R.string.commands_other_skills),
        leading = leading,
        onNewCommand = null,
        refreshing = page.refreshing,
        onRefresh = page::refresh,
        modifier = modifier,
        inSheet = inSheet
    ) {
        OtherSkillList(list.othersIn(null), onOpen)
    }
}

@Composable
internal fun OtherSkillList(skills: List<OtherSkill>, onOpen: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = CommandsListPadding) {
        if (skills.isNotEmpty()) {
            item(key = "skills") {
                ListCard {
                    skills.forEach { skill -> SkillRow(skill, onClick = { onOpen(skill.name) }) }
                }
            }
        }
    }
}

/** A skill not made in lpm in a list: `/name` over what it does. */
@Composable
internal fun SkillRow(skill: OtherSkill, onClick: () -> Unit) {
    val typography = LpmTheme.typography
    ListRow(onClick = onClick, verticalPadding = 10.dp, trailing = { DisclosureChevron() }) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = "/${skill.name}",
                style = typography.subheadline.copy(
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (skill.description.isNotEmpty()) {
                Text(
                    text = skill.description,
                    style = typography.caption1,
                    color = LpmTheme.colors.secondaryLabel,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
