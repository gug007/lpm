package cx.lpm.mobile.feature.mac.generate

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.PlainTextField
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.component.SecondaryButton
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GenerateRequest
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.mac.R

/**
 * The session's oldest waiting `lpm generate` request over whatever is open (iOS
 * `GenerateSheets`). Swiping it away leaves it waiting on the Mac.
 */
@Composable
fun GenerateSheetRoute(session: SessionKey = SessionKey.Live) {
    val viewModel = generateViewModel(session)
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val request = state.generate.shown ?: return
    key(request.id) {
        GenerateRequestSheet(
            request = request,
            macName = state.macLabel,
            waiting = state.generate.waiting,
            busy = state.generate.answering == request.id,
            error = state.generate.error,
            onAnswer = { decision, prompt, key ->
                viewModel.answer(request, decision, prompt, key)
            },
            onDismiss = { viewModel.setAside(request) }
        )
    }
}

/**
 * An agent's request as the Mac's card shows it: what it makes, from which prompt
 * (editable before anything is spent), for how much and where it goes. A missing
 * key is typed in here and saved on the Mac (iOS `GenerateRequestSheet`).
 */
@Composable
internal fun GenerateRequestSheet(
    request: GenerateRequest,
    macName: String,
    waiting: Int,
    busy: Boolean,
    error: String?,
    onAnswer: (decision: String, prompt: String, key: String) -> Unit,
    onDismiss: () -> Unit
) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    val uri = LocalUriHandler.current
    var prompt by rememberSaveable { mutableStateOf(request.prompt) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var key by rememberSaveable { mutableStateOf("") }
    val keyFocus = remember { FocusRequester() }
    val needsKey = request.needsKey != null
    val sheet = rememberModalSheetState(medium = true)
    LaunchedEffect(needsKey) { if (needsKey) runCatching { keyFocus.requestFocus() } }

    val subtitle = if (needsKey) {
        stringResource(
            R.string.generate_key_waiting,
            request.who,
            macName,
            request.agent.ifEmpty { stringResource(R.string.generate_the_agent) }
        )
    } else {
        val place = if (request.project.isEmpty()) {
            macName
        } else {
            stringResource(R.string.generate_place, request.project, macName)
        }
        if (waiting > 0) {
            pluralStringResource(R.plurals.generate_more_waiting, waiting, place, waiting)
        } else {
            place
        }
    }
    val send = { decision: String -> onAnswer(decision, prompt, key) }

    ModalSheet(onDismissRequest = onDismiss, state = sheet, fullHeight = false, plain = true) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    Modifier
                        .size(40.dp)
                        .background(colors.secondarySystemBackground, RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        painterResource(
                            when {
                                needsKey -> DesignR.drawable.ic_key
                                request.isSpeech -> DesignR.drawable.ic_graphic_eq
                                else -> DesignR.drawable.ic_image
                            }
                        ),
                        contentDescription = null,
                        tint = colors.label,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(request.title, style = type.headline, color = colors.label)
                    Text(subtitle, style = type.subheadline, color = colors.secondaryLabel)
                }
            }

            if (needsKey) {
                val label = stringResource(R.string.generate_key_label, request.keyLabel)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PlainTextField(
                        value = key,
                        onValueChange = { key = it },
                        placeholder = stringResource(R.string.generate_paste_key),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            autoCorrectEnabled = false
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(keyFocus)
                            .semantics { contentDescription = label }
                            .background(colors.secondarySystemBackground, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    )
                    GenerateRequest.GET_KEY_URLS[request.needsKey]?.let { url ->
                        LinkButton(
                            text = stringResource(R.string.generate_get_key),
                            onClick = { uri.openUri(url) },
                            textStyle = type.footnote
                        )
                    }
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .background(colors.secondarySystemBackground, RoundedCornerShape(12.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (editing) {
                    val fieldText = if (request.isSpeech) {
                        R.string.generate_text_to_speak
                    } else {
                        R.string.generate_prompt
                    }
                    PlainTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        placeholder = stringResource(fieldText),
                        minLines = 3,
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    Text(prompt, style = type.body, color = colors.label)
                }
                LinkButton(
                    text = stringResource(
                        if (editing) R.string.generate_done else R.string.generate_edit
                    ),
                    onClick = { editing = !editing },
                    textStyle = type.footnote
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(request.facts, style = type.subheadline, color = colors.secondaryLabel)
                Text(
                    request.out,
                    style = type.footnote.copy(fontFamily = FontFamily.Monospace),
                    color = colors.secondaryLabel,
                    maxLines = 2,
                    overflow = TextOverflow.MiddleEllipsis
                )
                Text(
                    if (request.overLimit) {
                        stringResource(R.string.generate_over_limit, request.today)
                    } else {
                        request.today
                    },
                    style = type.footnote,
                    color = if (request.overLimit) colors.orange else colors.secondaryLabel
                )
            }

            error?.let { Text(it, style = type.footnote, color = colors.red) }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ProminentButton(
                    text = request.primaryLabel,
                    onClick = { send(request.primaryDecision) },
                    busy = busy,
                    enabled = !busy && !(needsKey && key.trimmingWhitespace().isEmpty())
                )
                if (request.allowsProject) {
                    SecondaryButton(
                        text = stringResource(R.string.generate_just_once),
                        onClick = { send("once") },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                SecondaryButton(
                    text = stringResource(
                        if (needsKey) R.string.generate_cancel else R.string.generate_deny
                    ),
                    onClick = { send("deny") },
                    enabled = !busy,
                    contentColor = colors.red,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
