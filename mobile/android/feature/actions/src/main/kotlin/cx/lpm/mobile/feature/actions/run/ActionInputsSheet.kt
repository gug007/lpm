package cx.lpm.mobile.feature.actions.run

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionInput
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.actions.R as ActionsR
import cx.lpm.mobile.feature.actions.editor.PlainKeyboard

/**
 * Collects an action's declared inputs before it runs (iOS `ActionInputsSheet`, the
 * desktop's inputs modal). Values go to the Mac as typed; it fills them into the
 * command's `{{key}}` tokens. An action that also asks for confirmation reads "Next".
 * [initial] values start ahead of the defaults (a page's `lpm.run`).
 */
@Composable
fun ActionInputsSheet(
    action: Action,
    onSubmit: (Map<String, String>) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    initial: Map<String, String> = emptyMap()
) {
    val sheet = rememberModalSheetState()
    var values by rememberSaveable { mutableStateOf(initialValues(action) + initial) }
    val canSubmit = action.inputs.all {
        !it.required || values[it.key].orEmpty().trimmingWhitespace().isNotEmpty()
    }
    // The medium detent, lifted over the keyboard.
    ModalSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        fullHeight = false,
        state = sheet,
        floating = true,
        contentInsets = WindowInsets.navigationBars.union(WindowInsets.ime)
    ) {
        Column(Modifier.fillMaxHeight(MEDIUM_DETENT)) {
            LpmTopBar(
                title = action.label,
                modifier = Modifier.padding(top = 16.dp),
                windowInsets = WindowInsets(0),
                leading = {
                    GlassCapsuleButton(
                        text = stringResource(ActionsR.string.cancel),
                        onClick = { sheet.dismiss(onDismiss) }
                    )
                },
                trailing = {
                    GlassCapsuleButton(
                        text = stringResource(
                            if (action.confirm) {
                                ActionsR.string.actions_next
                            } else {
                                ActionsR.string.actions_run
                            }
                        ),
                        onClick = {
                            val out = action.inputs.associate {
                                it.key to
                                    (values[it.key] ?: it.defaultValue)
                            }
                            sheet.dismiss { onSubmit(out) }
                        },
                        enabled = canSubmit,
                        textStyle = LpmTheme.typography.headline
                    )
                }
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(top = FirstHeaderTopPadding)
            ) {
                action.inputs.forEach { input ->
                    InputSection(input, values[input.key] ?: input.defaultValue) {
                        values = values + (input.key to it)
                    }
                }
            }
        }
    }
}

/** iOS's medium detent. */
internal const val MEDIUM_DETENT = 0.55f

/** Where iOS's form puts the first input's title under the sheet's bar (measured). */
private val FirstHeaderTopPadding = 13.dp

/** A select starts on its default, else its first option; anything else on its default. */
internal fun initialValues(action: Action): Map<String, String> = action.inputs.associate {
    it.key to if (it.isSelect && it.defaultValue.isEmpty()) {
        it.options.firstOrNull()?.value.orEmpty()
    } else {
        it.defaultValue
    }
}

@Composable
private fun InputSection(input: ActionInput, value: String, onChange: (String) -> Unit) {
    Column(Modifier.padding(horizontal = ListDefaults.Margin)) {
        Row(
            Modifier.padding(
                start = ListDefaults.RowPadding,
                end = ListDefaults.RowPadding,
                top = 2.dp,
                bottom = 8.8.dp
            )
        ) {
            Text(
                input.label,
                style = LpmTheme.typography.headline,
                color = LpmTheme.colors.secondaryLabel
            )
            if (input.required) {
                Spacer(Modifier.width(3.dp))
                Text("*", style = LpmTheme.typography.headline, color = LpmTheme.colors.red)
            }
        }
        ListCard {
            val hint = input.placeholder.ifEmpty { input.label }
            when {
                // Every option on its own row, as the desktop lists its radio buttons.
                input.isSelect -> input.options.forEach { option ->
                    ListRow(
                        onClick = { onChange(option.value) },
                        trailing = {
                            if (option.value == value) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_check),
                                    contentDescription = null,
                                    tint = LpmTheme.colors.tint,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                    ) {
                        Text(
                            option.label,
                            style = LpmTheme.typography.body,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                input.isSecret -> ListRow {
                    SecretField(value, onChange, hint, Modifier.weight(1f))
                }

                else -> TextFieldRow(
                    value = value,
                    onValueChange = onChange,
                    placeholder = hint,
                    keyboardOptions = PlainKeyboard,
                    maxLines = 4
                )
            }
        }
        Spacer(Modifier.height(25.6.dp))
    }
}

/** `SecureField`: the value hidden as it's typed. */
@Composable
private fun SecretField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val style = LpmTheme.typography.body.copy(color = colors.label)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        textStyle = style,
        singleLine = true,
        cursorBrush = SolidColor(colors.tint),
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = PlainKeyboard.copy(keyboardType = KeyboardType.Password),
        decorationBox = { field ->
            Box {
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        style = style.copy(color = colors.placeholderText)
                    )
                }
                field()
            }
        }
    )
}
