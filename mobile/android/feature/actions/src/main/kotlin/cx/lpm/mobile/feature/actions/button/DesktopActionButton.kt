package cx.lpm.mobile.feature.actions.button

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.feature.actions.R as ActionsR

/**
 * What an action button does: run, offer "Show Popup" and "Edit Action…", and remember
 * a group's last child.
 */
@Immutable
class ActionCallbacks(
    val run: (Action) -> Unit,
    /** Long-press offers "Edit Action…" when set. */
    val edit: ((Action) -> Unit)? = null,
    /** Long-press offers "Show Popup" for an action with a popup when set: the Mac makes them. */
    val popup: ((Action) -> Unit)? = null,
    /** The child a `last-used` group ran last on this phone. */
    val lastUsed: (group: String) -> String? = { null },
    val remember: (group: String, child: String) -> Unit = { _, _ -> }
)

/**
 * An action as the desktop draws it (iOS `DesktopActionButton`): its emoji and label on
 * a button washed in the action's color. A group whose `primary` resolves to a child,
 * or that has a command of its own, is a split button — the face runs that child or
 * the group's command, the chevron lists the children — and any other group opens its
 * children. [fill] stretches it to the width it's offered, as a zone's column does.
 */
@Composable
internal fun DesktopActionButton(
    action: Action,
    callbacks: ActionCallbacks,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
    fill: Boolean = false
) {
    var longPressMenu by remember { mutableStateOf(false) }
    val edit = callbacks.edit
    val popup = callbacks.popup?.takeIf { action.popup != null }
    val longPress: (() -> Unit)? = if (edit != null || popup != null) {
        { longPressMenu = true }
    } else {
        null
    }
    val run = { child: Action ->
        action.lastUsedKey(child)?.let { callbacks.remember(action.name, it) }
        callbacks.run(child)
    }
    Box(modifier) {
        val primary = action.primaryChild(callbacks.lastUsed(action.name))
        when {
            action.isRunnable -> PlainButton(action, compact, fill, {
                callbacks.run(action)
            }, longPress)

            primary != null -> SplitButton(action, primary, compact, fill, run, longPress)

            action.cmd.isNotEmpty() -> SplitButton(action, action, compact, fill, run, longPress)

            else -> MenuButton(action, compact, fill, run, longPress)
        }
        if (longPress != null) {
            ContextMenu(expanded = longPressMenu, onDismissRequest = { longPressMenu = false }) {
                if (popup != null) {
                    ContextMenuItem(
                        title = stringResource(ActionsR.string.actions_show_popup),
                        onClick = { popup(action) },
                        icon = painterResource(R.drawable.ic_bar_chart)
                    )
                }
                if (edit != null) {
                    ContextMenuItem(
                        title = stringResource(ActionsR.string.actions_edit),
                        onClick = { edit(action) },
                        icon = painterResource(R.drawable.ic_edit)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PlainButton(
    action: Action,
    compact: Boolean,
    fill: Boolean,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)?
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    ActionFace(
        tint = ActionTint.of(action.color),
        compact = compact,
        pressed = pressed,
        modifier = Modifier
            .then(if (fill) Modifier.fillMaxWidth() else Modifier)
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onLongClick = onLongClick,
                onClick = onClick
            ),
        horizontalPadding = 14.dp
    ) { style ->
        FaceLabel(action, style)
    }
}

/** The face runs [primary]; the chevron lists the group's children. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SplitButton(
    action: Action,
    primary: Action,
    compact: Boolean,
    fill: Boolean,
    run: (Action) -> Unit,
    onLongClick: (() -> Unit)?
) {
    var menu by remember { mutableStateOf(false) }
    val face = remember { MutableInteractionSource() }
    val chevron = remember { MutableInteractionSource() }
    val facePressed by face.collectIsPressedAsState()
    val chevronPressed by chevron.collectIsPressedAsState()
    val more = stringResource(ActionsR.string.actions_more, action.label)
    ActionFace(
        tint = ActionTint.of(primary.color.ifEmpty { action.color }),
        compact = compact,
        pressed = facePressed || chevronPressed,
        modifier = if (fill) Modifier.fillMaxWidth() else Modifier
    ) { style ->
        Box(
            Modifier
                .then(if (fill) Modifier.weight(1f) else Modifier)
                .fillMaxHeight()
                .combinedClickable(
                    interactionSource = face,
                    indication = null,
                    role = Role.Button,
                    onLongClick = onLongClick,
                    onClick = { run(primary) }
                )
                .padding(start = 14.dp, end = 12.dp),
            contentAlignment = Alignment.Center
        ) {
            FaceLabel(primary, style)
        }
        Box(
            Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(dividerColor())
        )
        Box(
            Modifier
                .width(40.dp)
                .fillMaxHeight()
                .combinedClickable(
                    interactionSource = chevron,
                    indication = null,
                    role = Role.Button,
                    onLongClick = onLongClick,
                    onClick = { menu = true }
                )
                .semantics { contentDescription = more },
            contentAlignment = Alignment.Center
        ) {
            Chevron(style)
            ContextMenu(expanded = menu, onDismissRequest = { menu = false }) {
                ActionMenuItems(action.children, run)
            }
        }
    }
}

/** A group with nothing to run itself: the button opens its children. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MenuButton(
    action: Action,
    compact: Boolean,
    fill: Boolean,
    run: (Action) -> Unit,
    onLongClick: (() -> Unit)?
) {
    var menu by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box {
        ActionFace(
            tint = ActionTint.of(action.color),
            compact = compact,
            pressed = pressed,
            modifier = Modifier
                .then(if (fill) Modifier.fillMaxWidth() else Modifier)
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onLongClick = onLongClick,
                    onClick = { menu = true }
                ),
            horizontalPadding = 14.dp
        ) { style ->
            FaceLabel(action, style)
            Chevron(style, Modifier.padding(start = 6.dp))
        }
        ContextMenu(expanded = menu, onDismissRequest = { menu = false }) {
            ActionMenuItems(action.children, run)
        }
    }
}

/** A group's children as menu items, nested groups as submenus. */
@Composable
internal fun ColumnScope.ActionMenuItems(actions: List<Action>, onPick: (Action) -> Unit) {
    actions.forEach { action ->
        if (action.isRunnable) {
            ContextMenuItem(title = action.displayLabel, onClick = { onPick(action) })
        } else {
            ContextMenuSubmenu(title = action.displayLabel) {
                ActionMenuItems(action.children, onPick)
            }
        }
    }
}

// The desktop's plain border, lighter in dark mode, where the separator would
// disappear into the dark glass.
@Composable
private fun dividerColor(): Color {
    val colors = LpmTheme.colors
    return if (colors.isDark) Color.White.copy(alpha = 0.2f) else colors.separator
}
