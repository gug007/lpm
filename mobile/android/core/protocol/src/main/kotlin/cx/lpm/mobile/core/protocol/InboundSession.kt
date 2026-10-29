package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.LimitsSnapshot
import cx.lpm.mobile.core.model.MacBuild
import cx.lpm.mobile.core.model.MacUpdateCheck
import cx.lpm.mobile.core.model.MacUpdateStep
import cx.lpm.mobile.core.model.MachinePairOffer
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.USAGE_GENERIC_ERROR
import cx.lpm.mobile.core.model.WeeklyRecap
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.reqIdString
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings

internal val sessionParsers = parsers {
    put("paired") { o ->
        Inbound.Paired(
            deviceId = o.str("deviceId"),
            token = o.str("token"),
            serverId = o.string("serverId"),
            serverName = o.string("serverName"),
            hosts = o.strings("hosts").orEmpty(),
            platform = o.string("platform"),
            build = MacBuild.parse(o),
            features = o.strings("features").orEmpty().toSet()
        )
    }
    put("pairPending") { o -> Inbound.PairPending(matchCode = o.str("matchCode")) }
    put("pairDenied") { o ->
        Inbound.PairDenied(reason = o.string("reason") ?: "declined", message = o.string("message"))
    }
    put("ready") { o ->
        Inbound.Ready(
            serverId = o.string("serverId"),
            serverName = o.string("serverName"),
            hosts = o.strings("hosts").orEmpty(),
            platform = o.string("platform"),
            build = MacBuild.parse(o),
            features = o.strings("features").orEmpty().toSet()
        )
    }
    put("bye") { o -> Inbound.Bye(reason = o.str("reason"), at = o.long("at")) }
    put("error") { o -> Inbound.Error(o.string("error") ?: "error") }
    put("pong") { Inbound.Pong }
    put("apnsToken") { o -> Inbound.ApnsToken(ok = o.ok) }
    put("pushToken") { o -> Inbound.PushToken(ok = o.ok) }
    put("answerAgent") { o ->
        Inbound.AnswerAgent(
            reqId = o["reqId"].reqIdString(),
            error = o.failure("The Mac couldn't send it.")
        )
    }
    put("liveActivity") { o -> Inbound.LiveActivity(ok = o.ok) }
    put("stats") { o ->
        Inbound.Stats(
            stats = if (o.ok) AgentStats.parse(o.obj("stats") ?: emptyObject, reply = o) else null,
            error = o.failure("Couldn't load stats.")
        )
    }
    put("weeklyRecap") { o ->
        val period = o.str("period").ifEmpty { "week" }
        Inbound.WeeklyRecap(
            week = o.str("week"),
            period = period,
            recap = if (o.ok) WeeklyRecap.parse(o.obj("recap") ?: emptyObject) else null,
            error = o.failure("Couldn't read the $period.")
        )
    }
    put("limits") { o ->
        Inbound.Limits(
            snapshot = if (o.ok) LimitsSnapshot.parse(o) else null,
            error = o.failure(USAGE_GENERIC_ERROR)
        )
    }
    put("limits-changed") { o -> Inbound.LimitsChanged(LimitsSnapshot.parse(o)) }
    put("ttsSpeak") { o ->
        Inbound.TtsSpeak(
            reqId = o.str("reqId"),
            audio = if (o.ok) o.string("audio") else null,
            error = o.failure("Couldn't synthesize speech.")
        )
    }
    put("machines") { o -> Inbound.Machines(o.list("machines", RemoteMachine::parse)) }
    put("machinePair") { o ->
        Inbound.MachinePair(
            slug = o.str("slug"),
            offer = if (o.ok) MachinePairOffer.parse(o) else null,
            error = o.failure("Couldn't get a pairing code.")
        )
    }
    put("updateCheck") { o -> Inbound.UpdateCheck(MacUpdateCheck.parse(o)) }
    put("updateProgress") { o -> Inbound.UpdateProgress(MacUpdateStep.parse(o)) }
    put("updateInstall") { o ->
        Inbound.UpdateInstall(
            cancelled = o.bool("cancelled") ?: false,
            error = o.failure("The update didn't start.")
        )
    }
    put("updateCancel") { o -> Inbound.UpdateCancel(stopping = o.bool("stopping") ?: false) }
}
