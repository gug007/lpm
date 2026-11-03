package cx.lpm.mobile.feature.commands.editor

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.PlainTextField
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.ui.lpmCommandTint
import cx.lpm.mobile.feature.commands.R

/** What the editor's fields and buttons do. */
@Immutable
class EditorActions(
    val setName: (String) -> Unit = {},
    val setDescription: (String) -> Unit = {},
    val setBody: (String) -> Unit = {},
    val place: (CommandScope, String?) -> Unit = { _, _ -> },
    val delete: () -> Unit = {}
)

/**
 * The editor's form: the Mac's refusal on top, then Name, the folder picker,
 * Description, Prompt with what its variables do, and Delete command when editing.
 */
@Composable
internal fun CommandEditorForm(
    state: CommandEditorUiState,
    actions: EditorActions,
    modifier: Modifier = Modifier
) {
    val draft = state.draft
    Column(
        modifier
            .fillMaxWidth()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(top = ListDefaults.ContentTopPadding - 7.6.dp, bottom = 24.dp)
    ) {
        state.error?.let { ErrorSection(it) }
        Section(stringResource(R.string.command_editor_name)) {
            NameRow(draft.name, actions.setName)
        }
        ListSection {
            FolderPickerRow(state.places, draft.scope, draft.folder, actions.place)
        }
        Section(stringResource(R.string.command_editor_description)) {
            TextFieldRow(
                value = draft.description,
                onValueChange = actions.setDescription,
                placeholder = stringResource(R.string.command_editor_description_placeholder)
            )
        }
        ListSection(
            header = stringResource(R.string.command_editor_prompt),
            headerStyle = ListHeaderStyle.Title,
            footerContent = { CommandVariablesHint(draft.body, draft.name) }
        ) {
            TextFieldRow(
                value = draft.body,
                onValueChange = actions.setBody,
                placeholder = "",
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false),
                maxLines = Int.MAX_VALUE,
                minLines = PROMPT_LINES
            )
        }
        if (!state.isNew) {
            ListSection {
                ButtonRow(
                    text = stringResource(R.string.command_editor_delete),
                    onClick = actions.delete,
                    enabled = !state.saving,
                    destructive = true
                )
            }
        }
    }
}

@Composable
private fun Section(header: String, content: @Composable () -> Unit) {
    ListSection(header = header, headerStyle = ListHeaderStyle.Title, content = content)
}

/** "/" and the name, monospaced in lpm's accent. */
@Composable
private fun NameRow(name: String, onChange: (String) -> Unit) {
    val tint = lpmCommandTint
    val style = LpmTheme.typography.body.copy(fontFamily = FontFamily.Monospace)
    ListRow {
        Text("/", style = style, color = tint)
        PlainTextField(
            value = name,
            onValueChange = onChange,
            placeholder = stringResource(R.string.command_editor_name_placeholder),
            modifier = Modifier
                .weight(1f)
                .padding(start = 1.dp),
            textStyle = style,
            textColor = tint,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false
            )
        )
    }
}

@Composable
private fun ErrorSection(error: String) {
    val red = LpmTheme.colors.red
    ListSection {
        ListRow(
            leading = {
                Icon(
                    painterResource(DesignR.drawable.ic_warning),
                    contentDescription = null,
                    tint = red,
                    modifier = Modifier.size(20.dp)
                )
            }
        ) {
            Text(error, style = LpmTheme.typography.body, color = red)
        }
    }
}

// iOS's 160 pt editor, in lines of body text.
private const val PROMPT_LINES = 7
