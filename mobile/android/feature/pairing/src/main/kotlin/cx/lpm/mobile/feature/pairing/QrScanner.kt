package cx.lpm.mobile.feature.pairing

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** Full-screen QR scanner: hands the first pairing code it reads to [onScan] and closes. */
@Composable
internal fun QrScannerSheet(onScan: (PairPayload) -> Unit, onDismiss: () -> Unit) {
    val sheet = rememberModalSheetState()
    ModalSheet(
        onDismissRequest = onDismiss,
        state = sheet,
        contentInsets = WindowInsets(0),
        plain = true
    ) {
        QrScanner(
            onScan = { payload ->
                onScan(payload)
                sheet.dismiss(onDismiss)
            },
            onClose = { sheet.dismiss(onDismiss) }
        )
    }
}

/** What the scanner says while it can't show the camera. */
internal enum class CameraProblem { Denied, Unavailable }

@Composable
internal fun QrScanner(
    onScan: (PairPayload) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var problem by remember { mutableStateOf<CameraProblem?>(null) }
    var hasTorch by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        if (!ok) problem = CameraProblem.Denied
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }
    Box(modifier.fillMaxSize().background(Color.Black)) {
        if (granted) {
            CameraPreview(
                torchOn = torchOn,
                onCode = { raw -> PairPayload.parse(raw)?.let(onScan) != null },
                onSetupFailure = { problem = CameraProblem.Unavailable },
                onTorchAvailable = { hasTorch = it },
                modifier = Modifier.fillMaxSize()
            )
        }
        ScannerChrome(
            problem = problem,
            onClose = onClose,
            torchOn = torchOn.takeIf { hasTorch },
            onToggleTorch = { torchOn = !torchOn },
            onOpenSettings = context::openAppSettings
        )
    }
}

/**
 * Over the camera: the square to hold the code in, Close, the torch when [torchOn]
 * isn't null, and what to scan — or, with the camera off, the way to Settings.
 */
@Composable
internal fun ScannerChrome(
    problem: CameraProblem?,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    torchOn: Boolean? = null,
    onToggleTorch: () -> Unit = {},
    onOpenSettings: () -> Unit = {}
) {
    val material = LpmTheme.colors.systemBackground.copy(alpha = 0.75f)
    val shape = RoundedCornerShape(10.dp)
    Box(modifier.fillMaxSize()) {
        when (problem) {
            CameraProblem.Unavailable -> Text(
                stringResource(R.string.scanner_unavailable),
                style = LpmTheme.typography.footnote,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.4f), shape)
                    .padding(16.dp)
            )

            null -> ViewfinderCorners(Modifier.align(Alignment.Center).size(240.dp))

            CameraProblem.Denied -> Unit
        }
        Icon(
            painter = painterResource(DesignR.drawable.ic_cancel_fill),
            contentDescription = stringResource(R.string.close),
            tint = Color.White,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
                .size(30.dp)
                .clickable(role = Role.Button, onClick = onClose)
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (torchOn != null && problem != CameraProblem.Denied) {
                TorchButton(on = torchOn, onClick = onToggleTorch)
            }
            Column(
                modifier = Modifier
                    .background(material, shape)
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    stringResource(
                        if (problem == CameraProblem.Denied) {
                            R.string.scanner_denied
                        } else {
                            R.string.scanner_hint
                        }
                    ),
                    style = LpmTheme.typography.footnote,
                    textAlign = TextAlign.Center
                )
                if (problem == CameraProblem.Denied) {
                    CapsuleButton(
                        text = stringResource(R.string.scanner_open_settings),
                        onClick = onOpenSettings,
                        prominent = true,
                        textStyle = LpmTheme.typography.body
                    )
                }
            }
        }
    }
}

@Composable
private fun TorchButton(on: Boolean, onClick: () -> Unit) {
    val label = stringResource(if (on) R.string.scanner_torch_off else R.string.scanner_torch_on)
    val icon = if (on) {
        DesignR.drawable.ic_flashlight_on_fill
    } else {
        DesignR.drawable.ic_flashlight_off_fill
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(
                if (on) Color.White else LpmTheme.colors.systemBackground.copy(alpha = 0.35f)
            )
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label }
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = null,
            tint = if (on) Color.Black else Color.White,
            modifier = Modifier.size(26.dp)
        )
    }
}

/** The four corners of the square to hold the code in. */
@Composable
private fun ViewfinderCorners(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val length = 40.dp.toPx()
        val radius = 18.dp.toPx()
        val stroke = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
        val shadow = Stroke(width = 7.dp.toPx(), cap = StrokeCap.Round)
        val corners = listOf(
            Triple(Offset(0f, 0f), 1f, 1f),
            Triple(Offset(size.width, 0f), -1f, 1f),
            Triple(Offset(size.width, size.height), -1f, -1f),
            Triple(Offset(0f, size.height), 1f, -1f)
        )
        for ((corner, dx, dy) in corners) {
            val path = Path().apply {
                moveTo(corner.x, corner.y + dy * length)
                lineTo(corner.x, corner.y + dy * radius)
                quadraticTo(corner.x, corner.y, corner.x + dx * radius, corner.y)
                lineTo(corner.x + dx * length, corner.y)
            }
            drawPath(path, Color.Black.copy(alpha = 0.3f), style = shadow)
            drawPath(path, Color.White, style = stroke)
        }
    }
}

private fun Context.openAppSettings() {
    startActivity(
        Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", packageName, null)
        )
    )
}
