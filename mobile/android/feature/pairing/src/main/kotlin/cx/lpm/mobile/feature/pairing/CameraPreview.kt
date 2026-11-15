package cx.lpm.mobile.feature.pairing

import androidx.camera.compose.CameraXViewfinder
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.awaitCancellation

/**
 * The back camera's picture, with every QR code ML Kit reads handed to [onCode]
 * until it returns true. [onSetupFailure] when the camera can't start;
 * [onTorchAvailable] once it has, saying whether [torchOn] can light it.
 */
@Composable
internal fun CameraPreview(
    onCode: (String) -> Boolean,
    onSetupFailure: () -> Unit,
    modifier: Modifier = Modifier,
    torchOn: Boolean = false,
    onTorchAvailable: (Boolean) -> Unit = {}
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val handle by rememberUpdatedState(onCode)
    val fail by rememberUpdatedState(onSetupFailure)
    val torchAvailable by rememberUpdatedState(onTorchAvailable)
    var request by remember { mutableStateOf<SurfaceRequest?>(null) }
    var bound by remember { mutableStateOf<Camera?>(null) }
    LaunchedEffect(bound, torchOn) {
        bound?.takeIf { it.cameraInfo.hasFlashUnit() }?.cameraControl?.enableTorch(torchOn)
    }
    LaunchedEffect(lifecycle) {
        val provider = try {
            ProcessCameraProvider.awaitInstance(context)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            fail()
            return@LaunchedEffect
        }
        val camera = listOf(CameraSelector.DEFAULT_BACK_CAMERA, CameraSelector.DEFAULT_FRONT_CAMERA)
            .firstOrNull { runCatching { provider.hasCamera(it) }.getOrDefault(false) }
        if (camera == null) {
            fail()
            return@LaunchedEffect
        }
        val preview = Preview.Builder().build().apply { setSurfaceProvider { request = it } }
        val scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        )
        val main = ContextCompat.getMainExecutor(context)
        var handled = false
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(
            main,
            MlKitAnalyzer(
                listOf(scanner),
                ImageAnalysis.COORDINATE_SYSTEM_ORIGINAL,
                main
            ) { result ->
                if (handled) return@MlKitAnalyzer
                val codes = result.getValue(scanner).orEmpty().mapNotNull { it.rawValue }
                handled = codes.any { handle(it) }
            }
        )
        bound = try {
            provider.bindToLifecycle(lifecycle, camera, preview, analysis)
        } catch (e: IllegalStateException) {
            fail()
            scanner.close()
            return@LaunchedEffect
        } catch (e: IllegalArgumentException) {
            fail()
            scanner.close()
            return@LaunchedEffect
        }
        torchAvailable(bound?.cameraInfo?.hasFlashUnit() == true)
        try {
            awaitCancellation()
        } finally {
            bound = null
            analysis.clearAnalyzer()
            provider.unbind(preview, analysis)
            scanner.close()
        }
    }
    request?.let {
        CameraXViewfinder(
            surfaceRequest = it,
            modifier = modifier,
            contentScale = ContentScale.Crop
        )
    }
}
