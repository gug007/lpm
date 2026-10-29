// Waking a sleeping machine from a phone. Each machine tells its phones, when
// they connect, the network cards it can be woken through: the card's hardware
// address, its home-network address and that network's broadcast address. When
// it later sleeps, the phone sends a wake ("magic") packet itself, and asks any
// other paired machine that is awake to send one on its network too: an iPhone
// may only send to a single address, while a machine may broadcast. Connecting
// to the sleeping machine's lpm port also wakes it through a Bonjour Sleep Proxy
// (an Apple TV or HomePod on the network), which answers for it while it sleeps.
use serde_json::{json, Value};
use std::net::{Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::time::Duration;

/// The phone may send `wake`.
pub const FEATURE: &str = "wake";

/// Ports wake packets are customarily sent to (discard and echo).
const WOL_PORTS: [u16; 2] = [9, 7];
const POKE_TIMEOUT: Duration = Duration::from_millis(1500);

/// What macOS reports in place of a hardware address it keeps private.
const REDACTED: [u8; 6] = [2, 0, 0, 0, 0, 0];

#[derive(Clone, Debug, PartialEq)]
struct WakeTarget {
    mac: [u8; 6],
    ip: Ipv4Addr,
    broadcast: Ipv4Addr,
}

impl WakeTarget {
    fn to_json(&self) -> Value {
        json!({
            "mac": format_mac(&self.mac),
            "ip": self.ip.to_string(),
            "broadcast": self.broadcast.to_string(),
        })
    }

    fn from_json(v: &Value) -> Option<Self> {
        let field = |k: &str| v.get(k).and_then(Value::as_str);
        let ip: Ipv4Addr = field("ip")?.parse().ok()?;
        Some(Self {
            mac: parse_mac(field("mac")?)?,
            broadcast: field("broadcast")
                .and_then(|b| b.parse().ok())
                .unwrap_or(Ipv4Addr::BROADCAST),
            ip,
        })
    }
}

fn format_mac(mac: &[u8; 6]) -> String {
    mac.iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn parse_mac(s: &str) -> Option<[u8; 6]> {
    let parts: Vec<u8> = s
        .split([':', '-'])
        .map(|p| u8::from_str_radix(p, 16).ok())
        .collect::<Option<_>>()?;
    usable(parts.try_into().ok()?)
}

/// `mac`, unless it is blank, the broadcast address or macOS's placeholder.
fn usable(mac: [u8; 6]) -> Option<[u8; 6]> {
    (mac != [0; 6] && mac != [0xff; 6] && mac != REDACTED).then_some(mac)
}

/// Six 0xFF bytes, then the hardware address sixteen times.
fn magic_packet(mac: &[u8; 6]) -> Vec<u8> {
    let mut packet = vec![0xff; 6];
    for _ in 0..16 {
        packet.extend_from_slice(mac);
    }
    packet
}

#[cfg(any(unix, test))]
fn broadcast_of(ip: Ipv4Addr, netmask: Ipv4Addr) -> Ipv4Addr {
    Ipv4Addr::from(u32::from(ip) | !u32::from(netmask))
}

/// `frame` with this machine's wake targets, when it has any.
pub fn with_wake(mut frame: Value) -> Value {
    let targets = targets();
    if !targets.is_empty() {
        frame["wake"] = json!(targets.iter().map(WakeTarget::to_json).collect::<Vec<_>>());
    }
    frame
}

/// The `wake` verb: wake the machine named by `targets` (as another machine
/// reported them), poking its lpm `port` as well. Sends on its own thread.
pub fn handle(v: &Value) -> Value {
    let targets: Vec<WakeTarget> = v
        .get("targets")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(WakeTarget::from_json).take(8).collect())
        .unwrap_or_default();
    let port = v
        .get("port")
        .and_then(Value::as_u64)
        .and_then(|p| u16::try_from(p).ok())
        .unwrap_or(0);
    if targets.is_empty() {
        return json!({ "t": "wake", "ok": false, "error": "Nothing to wake." });
    }
    std::thread::spawn(move || send(&targets, port));
    json!({ "t": "wake", "ok": true })
}

/// Broadcast a wake packet on each target's network and send one straight to
/// its last address, then knock on its lpm port for a sleep proxy to notice.
fn send(targets: &[WakeTarget], port: u16) {
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        let _ = sock.set_broadcast(true);
        for target in targets {
            let packet = magic_packet(&target.mac);
            for to in [target.broadcast, Ipv4Addr::BROADCAST, target.ip] {
                for wol_port in WOL_PORTS {
                    let _ = sock.send_to(&packet, SocketAddr::from((to, wol_port)));
                }
            }
        }
    }
    if port != 0 {
        for target in targets {
            let _ = TcpStream::connect_timeout(&SocketAddr::from((target.ip, port)), POKE_TIMEOUT);
        }
    }
}

/// The cards this machine can be woken through: up, not loopback or a tunnel,
/// with a hardware address and a home-network (private) IPv4 address.
fn targets() -> Vec<WakeTarget> {
    #[cfg(unix)]
    {
        unix_targets()
    }
    #[cfg(windows)]
    {
        Vec::new()
    }
}

#[cfg(unix)]
fn unix_targets() -> Vec<WakeTarget> {
    use std::collections::HashMap;
    use std::ffi::CStr;

    use crate::netif::sockaddr_ipv4;

    let mut macs: HashMap<String, [u8; 6]> = HashMap::new();
    let mut inets: Vec<(String, Ipv4Addr, Ipv4Addr)> = Vec::new();
    crate::netif::each_ifaddr(|entry| {
        let flags = entry.ifa_flags as i32;
        if entry.ifa_addr.is_null()
            || entry.ifa_name.is_null()
            || flags & libc::IFF_UP == 0
            || flags & libc::IFF_LOOPBACK != 0
            || flags & libc::IFF_POINTOPOINT != 0
        {
            return;
        }
        let name = unsafe { CStr::from_ptr(entry.ifa_name) }
            .to_string_lossy()
            .into_owned();
        let family = unsafe { (*entry.ifa_addr).sa_family } as i32;
        if family == libc::AF_INET {
            let ip = unsafe { sockaddr_ipv4(entry.ifa_addr) };
            let mask = if entry.ifa_netmask.is_null() {
                Ipv4Addr::new(255, 255, 255, 0)
            } else {
                unsafe { sockaddr_ipv4(entry.ifa_netmask) }
            };
            if ip.is_private() {
                inets.push((name, ip, mask));
            }
        } else if let Some(mac) = unsafe { link_mac(entry.ifa_addr, family) } {
            macs.insert(name, mac);
        }
    });
    #[cfg(target_os = "macos")]
    if inets.iter().any(|(name, _, _)| !macs.contains_key(name)) {
        for (name, mac) in hardware_addresses() {
            macs.entry(name).or_insert(mac);
        }
    }
    inets
        .into_iter()
        .filter_map(|(name, ip, mask)| {
            Some(WakeTarget {
                mac: *macs.get(&name)?,
                ip,
                broadcast: broadcast_of(ip, mask),
            })
        })
        .collect()
}

/// macOS hands a process without Local Network access a placeholder hardware
/// address (02:00:00:00:00:00). `ifconfig`, which shows the address a network
/// knows the Mac by (its private Wi-Fi address included), is asked for the
/// cards still missing one. Cached for a minute, since every phone connection
/// asks.
#[cfg(target_os = "macos")]
fn hardware_addresses() -> std::collections::HashMap<String, [u8; 6]> {
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Instant;
    static CACHE: Mutex<Option<(Instant, HashMap<String, [u8; 6]>)>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap();
    if let Some((at, macs)) = cache.as_ref() {
        if at.elapsed() < Duration::from_secs(60) {
            return macs.clone();
        }
    }
    let macs = crate::osproc::command("/sbin/ifconfig")
        .output()
        .map(|out| parse_ifconfig(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or_default();
    *cache = Some((Instant::now(), macs.clone()));
    macs
}

/// Each interface's `ether` line in `ifconfig` output.
#[cfg(any(target_os = "macos", test))]
fn parse_ifconfig(out: &str) -> std::collections::HashMap<String, [u8; 6]> {
    let mut macs = std::collections::HashMap::new();
    let mut iface = "";
    for line in out.lines() {
        if !line.starts_with(char::is_whitespace) {
            iface = line.split(':').next().unwrap_or_default();
        } else if let Some(mac) = line.trim().strip_prefix("ether ") {
            if let Some(mac) = parse_mac(mac.split_whitespace().next().unwrap_or_default()) {
                macs.insert(iface.to_string(), mac);
            }
        }
    }
    macs
}

/// The hardware address in a link-layer entry: `sockaddr_dl` on macOS, whose
/// address follows the interface name inside `sdl_data`; `sockaddr_ll` on Linux.
#[cfg(target_os = "macos")]
unsafe fn link_mac(addr: *const libc::sockaddr, family: i32) -> Option<[u8; 6]> {
    if family != libc::AF_LINK {
        return None;
    }
    let sdl = addr as *const libc::sockaddr_dl;
    let (len, nlen, alen) = (
        (*sdl).sdl_len as usize,
        (*sdl).sdl_nlen as usize,
        (*sdl).sdl_alen as usize,
    );
    let start = std::mem::offset_of!(libc::sockaddr_dl, sdl_data) + nlen;
    if alen != 6 || start + alen > len {
        return None;
    }
    let bytes = std::slice::from_raw_parts((sdl as *const u8).add(start), alen);
    usable(bytes.try_into().ok()?)
}

#[cfg(all(unix, not(target_os = "macos")))]
unsafe fn link_mac(addr: *const libc::sockaddr, family: i32) -> Option<[u8; 6]> {
    #[cfg(target_os = "linux")]
    {
        if family != libc::AF_PACKET {
            return None;
        }
        let sll = addr as *const libc::sockaddr_ll;
        if (*sll).sll_halen != 6 {
            return None;
        }
        let sll_addr = (*sll).sll_addr;
        usable(sll_addr[..6].try_into().ok()?)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (addr, family);
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hardware_addresses_round_trip() {
        let mac = parse_mac("a4:83:e7:0B:1c:ff").unwrap();
        assert_eq!(mac, [0xa4, 0x83, 0xe7, 0x0b, 0x1c, 0xff]);
        assert_eq!(format_mac(&mac), "a4:83:e7:0b:1c:ff");
        assert_eq!(parse_mac("a4-83-e7-0b-1c-ff"), Some(mac));
        assert_eq!(parse_mac("a4:83:e7:0b:1c"), None);
        assert_eq!(parse_mac("00:00:00:00:00:00"), None);
        assert_eq!(parse_mac("zz:83:e7:0b:1c:ff"), None);
    }

    #[test]
    fn a_magic_packet_repeats_the_address() {
        let mac = [1, 2, 3, 4, 5, 6];
        let packet = magic_packet(&mac);
        assert_eq!(packet.len(), 102);
        assert_eq!(&packet[..6], &[0xff; 6]);
        assert!(packet[6..].chunks(6).all(|c| c == mac));
    }

    #[test]
    fn broadcast_fills_the_host_bits() {
        let ip = Ipv4Addr::new(192, 168, 1, 23);
        assert_eq!(
            broadcast_of(ip, Ipv4Addr::new(255, 255, 255, 0)),
            Ipv4Addr::new(192, 168, 1, 255)
        );
        assert_eq!(
            broadcast_of(Ipv4Addr::new(10, 0, 4, 7), Ipv4Addr::new(255, 255, 0, 0)),
            Ipv4Addr::new(10, 0, 255, 255)
        );
    }

    #[test]
    fn targets_parse_from_a_phone() {
        let v = json!({
            "port": 8765,
            "targets": [
                { "mac": "a4:83:e7:0b:1c:ff", "ip": "192.168.1.23", "broadcast": "192.168.1.255" },
                { "mac": "a4:83:e7:0b:1c:fe", "ip": "192.168.1.24" },
                { "mac": "bad", "ip": "192.168.1.25" },
            ],
        });
        let parsed: Vec<WakeTarget> = v["targets"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(WakeTarget::from_json)
            .collect();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[1].broadcast, Ipv4Addr::BROADCAST, "no network named: every network");
        assert_eq!(WakeTarget::from_json(&parsed[0].to_json()), Some(parsed[0].clone()));
    }

    #[test]
    fn ifconfig_names_each_cards_address() {
        let out = "lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384\n\tinet 127.0.0.1 netmask 0xff000000\nen0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500\n\toptions=6460<TSO4,TSO6,CHANNEL_IO>\n\tether 3a:07:2a:86:ff:1c\n\tinet 192.168.0.80 netmask 0xffffff00 broadcast 192.168.0.255\nbridge0: flags=8863<UP> mtu 1500\n\tether 02:00:00:00:00:00\n";
        let macs = parse_ifconfig(out);
        assert_eq!(macs.len(), 1);
        assert_eq!(macs["en0"], [0x3a, 0x07, 0x2a, 0x86, 0xff, 0x1c]);
    }

    #[test]
    fn nothing_to_wake_is_refused() {
        assert_eq!(handle(&json!({ "targets": [] }))["ok"], false);
    }

    #[test]
    fn this_machine_lists_only_private_addresses() {
        for target in targets() {
            assert!(target.ip.is_private(), "{:?}", target);
        }
    }
}
