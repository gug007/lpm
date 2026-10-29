import Foundation
import Network

/// A network card a Mac can be woken through, as it said in `ready`.
struct WakeTarget: Codable, Equatable {
    let mac: String
    let ip: String
    let broadcast: String

    init?(_ o: [String: Any]) {
        guard let mac = o["mac"] as? String, let ip = o["ip"] as? String,
              Self.hardwareAddress(mac) != nil else { return nil }
        self.mac = mac
        self.ip = ip
        self.broadcast = o["broadcast"] as? String ?? "255.255.255.255"
    }

    var json: [String: Any] { ["mac": mac, "ip": ip, "broadcast": broadcast] }

    static func hardwareAddress(_ text: String) -> [UInt8]? {
        let bytes = text.split(whereSeparator: { $0 == ":" || $0 == "-" }).compactMap { UInt8($0, radix: 16) }
        return bytes.count == 6 ? bytes : nil
    }

    /// Six 0xFF bytes, then the hardware address sixteen times.
    static func magicPacket(_ mac: [UInt8]) -> Data {
        var packet = Data(repeating: 0xff, count: 6)
        for _ in 0..<16 { packet.append(contentsOf: mac) }
        return packet
    }
}

/// Wakes a sleeping Mac from this phone: a wake packet straight to each of its
/// cards (an iPhone may not broadcast), and a knock on its lpm port at each home
/// address, which a Bonjour Sleep Proxy answers by waking it. Other machines are
/// asked by the model, since they need a connection of their own.
enum MacWaker {
    private static let queue = DispatchQueue(label: "lpm.wake")
    private static let wolPorts: [NWEndpoint.Port] = [9, 7]

    static func wake(targets: [WakeTarget], homeHosts: [String], port: UInt16) {
        for target in targets {
            guard let mac = WakeTarget.hardwareAddress(target.mac) else { continue }
            let packet = WakeTarget.magicPacket(mac)
            for host in [target.ip, target.broadcast] {
                for wolPort in wolPorts { sendDatagram(packet, to: host, port: wolPort) }
            }
        }
        guard let lpmPort = NWEndpoint.Port(rawValue: port) else { return }
        for host in Set(homeHosts + targets.map(\.ip)) { knock(host, port: lpmPort) }
    }

    private static func sendDatagram(_ data: Data, to host: String, port: NWEndpoint.Port) {
        let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .udp)
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
            case .failed, .waiting:
                connection.cancel()
            default:
                break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 3) { connection.cancel() }
    }

    private static func knock(_ host: String, port: NWEndpoint.Port) {
        let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 3) { connection.cancel() }
    }
}
