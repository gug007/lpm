package cx.lpm.mobile

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import cx.lpm.mobile.core.data.lock.OwnerCheck
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** The phone's fingerprint, face or screen lock, through the system prompt (iOS `LAContext`). */
internal class BiometricOwnerCheck(private val activity: FragmentActivity) : OwnerCheck {
    override fun available(): Boolean =
        BiometricManager.from(activity).canAuthenticate(AUTHENTICATORS) ==
            BiometricManager.BIOMETRIC_SUCCESS

    override suspend fun check(reason: String): Boolean = suspendCancellableCoroutine { done ->
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    if (done.isActive) done.resume(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (done.isActive) done.resume(false)
                }
            }
        )
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(reason)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build()
        )
        done.invokeOnCancellation { prompt.cancelAuthentication() }
    }

    private companion object {
        const val AUTHENTICATORS = BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    }
}
