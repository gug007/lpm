package cx.lpm.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * lpm's pairing QR read by the Camera or a QR app: hands the link to the app's own
 * task the way a notification tap does, so a running app gets it in `onNewIntent`
 * and the launcher icon still returns to whatever was open there.
 */
class PairLinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(this, MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(intent.data)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
        )
        finish()
    }
}
