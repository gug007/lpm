package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.protocol.Wire

// The Talk button: a sentence for the Mac to plan, and the plan it approved to run.

fun LpmClient.talkPlan(reqId: String, text: String) = send(Wire.talkPlan(reqId, text))

/**
 * Live only: a plan approved before the link dropped must not run by itself once the
 * link is back.
 */
fun LpmClient.talkRun(reqId: String, plan: TalkPlan) = sendLive(Wire.talkRun(reqId, plan))
