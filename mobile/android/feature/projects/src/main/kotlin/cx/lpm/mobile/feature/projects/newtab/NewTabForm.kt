package cx.lpm.mobile.feature.projects.newtab

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.detail.TerminalRowSkeleton

/** What the New Tab form's rows and bar do. */
@Immutable
class NewTabActions(
    val cancel: () -> Unit = {},
    val open: () -> Unit = {},
    val pickTerminal: () -> Unit = {},
    val pickOption: (LaunchpadOption) -> Unit = {},
    val chooseModel: (String) -> Unit = {},
    val chooseEffort: (String) -> Unit = {},
    val setPrompt: (String) -> Unit = {},
    val resume: () -> Unit = {}
)

/**
 * The New Tab sheet's form: what the tab starts with, a bare agent's model and effort,
 * the task for the agent, and the way to a past conversation instead.
 */
@Composable
fun NewTabForm(
    state: NewTabUiState,
    modifier: Modifier = Modifier,
    actions: NewTabActions = NewTabActions()
) {
    Column(modifier.fillMaxSize()) {
        LpmTopBar(
            title = stringResource(R.string.new_tab_title),
            modifier = Modifier.padding(top = 16.dp),
            windowInsets = WindowInsets(0),
            leading = {
                GlassCapsuleButton(text = stringResource(R.string.cancel), onClick = actions.cancel)
            },
            trailing = {
                GlassCapsuleButton(
                    text = stringResource(R.string.new_tab_open),
                    onClick = actions.open,
                    enabled = !state.awaitingOptions,
                    textStyle = LpmTheme.typography.headline
                )
            }
        )
        Column(
            Modifier
                .weight(1f)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(top = ListDefaults.ContentTopPadding, bottom = 24.dp)
        ) {
            StartSection(state, actions)
            state.bareAgent?.takeIf {
                it.models.isNotEmpty()
            }?.let { ModelSection(state, it, actions) }
            state.option?.let { option ->
                ListSection(header = stringResource(R.string.new_tab_first_prompt)) {
                    TextFieldRow(
                        value = state.prompt,
                        onValueChange = actions.setPrompt,
                        placeholder = stringResource(
                            R.string.new_tab_prompt_placeholder,
                            option.label
                        ),
                        minLines = 2,
                        maxLines = 6
                    )
                }
            }
            if (state.canResume) {
                ListSection {
                    ListRow(
                        onClick = actions.resume,
                        leading = {
                            Icon(
                                painter = painterResource(DesignR.drawable.ic_history),
                                contentDescription = null,
                                tint = LpmTheme.colors.tint
                            )
                        },
                        trailing = { DisclosureChevron() }
                    ) {
                        Text(
                            text = stringResource(R.string.new_tab_resume),
                            style = LpmTheme.typography.body,
                            color = LpmTheme.colors.label
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StartSection(state: NewTabUiState, actions: NewTabActions) {
    ListSection(header = stringResource(R.string.new_tab_start)) {
        NewTabStartRow(
            label = stringResource(R.string.new_tab_terminal),
            agent = null,
            picked = state.terminalPicked,
            onPick = actions.pickTerminal
        )
        val tabs = state.tabs
        if (tabs == null) {
            TerminalRowSkeleton()
            return@ListSection
        }
        tabs.forEach { tab ->
            key(tab.id) {
                val only = tab.options.singleOrNull()
                if (only == null) {
                    NewTabGroupRow(tab = tab, picked = state.picked, onPick = actions.pickOption)
                } else {
                    NewTabStartRow(
                        label = only.label,
                        agent = only.agent,
                        emoji = only.emoji,
                        picked = state.picked == only.id,
                        onPick = { actions.pickOption(only) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ModelSection(state: NewTabUiState, agent: AgentOption, actions: NewTabActions) {
    ListSection(
        header = stringResource(R.string.new_tab_model_section),
        footer = stringResource(R.string.new_tab_model_footer)
    ) {
        PickerRow(
            title = stringResource(R.string.new_tab_model),
            options = agent.models,
            selected = state.model ?: agent.models.first(),
            onSelect = { actions.chooseModel(it.value) },
            optionLabel = { it.label }
        )
        val efforts = state.model?.efforts.orEmpty()
        if (efforts.size > 1) {
            PickerRow(
                title = stringResource(R.string.new_tab_effort),
                options = efforts,
                selected = efforts.firstOrNull { it.value == state.pick.effort } ?: efforts.first(),
                onSelect = { actions.chooseEffort(it.value) },
                optionLabel = { it.label }
            )
        }
    }
}
