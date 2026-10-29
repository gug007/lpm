// The IPv4 addresses bound to this machine's network interfaces, for the hosts
// the pairing flows advertise (peer.rs for Macs, remote.rs for phones).
use std::net::Ipv4Addr;

/// Every IPv4 address on an interface, in the order the OS lists them.
pub fn ipv4_addrs() -> Vec<Ipv4Addr> {
    #[cfg(unix)]
    {
        unix_ipv4_addrs()
    }
    #[cfg(windows)]
    {
        windows_ipv4_addrs()
    }
}

#[cfg(windows)]
fn windows_ipv4_addrs() -> Vec<Ipv4Addr> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| match iface.addr {
            if_addrs::IfAddr::V4(v4) => Some(v4.ip),
            if_addrs::IfAddr::V6(_) => None,
        })
        .collect()
}

#[cfg(unix)]
fn unix_ipv4_addrs() -> Vec<Ipv4Addr> {
    unix_ipv4_ifaces().into_iter().map(|(ip, _)| ip).collect()
}

/// Every IPv4 address with its interface's flags (`IFF_*`).
#[cfg(unix)]
fn unix_ipv4_ifaces() -> Vec<(Ipv4Addr, i32)> {
    let mut out = Vec::new();
    each_ifaddr(|entry| {
        if !entry.ifa_addr.is_null()
            && unsafe { (*entry.ifa_addr).sa_family } as i32 == libc::AF_INET
        {
            out.push((unsafe { sockaddr_ipv4(entry.ifa_addr) }, entry.ifa_flags as i32));
        }
    });
    out
}

/// Calls `f` with every entry `getifaddrs` lists.
#[cfg(unix)]
pub fn each_ifaddr(mut f: impl FnMut(&libc::ifaddrs)) {
    let mut ifap: *mut libc::ifaddrs = std::ptr::null_mut();
    if unsafe { libc::getifaddrs(&mut ifap) } != 0 {
        return;
    }
    let mut cur = ifap;
    while !cur.is_null() {
        let entry = unsafe { &*cur };
        f(entry);
        cur = entry.ifa_next;
    }
    unsafe { libc::freeifaddrs(ifap) };
}

/// The IPv4 address in `addr`, which must point to a `sockaddr_in`.
#[cfg(unix)]
pub unsafe fn sockaddr_ipv4(addr: *const libc::sockaddr) -> Ipv4Addr {
    let sin = addr as *const libc::sockaddr_in;
    Ipv4Addr::from(u32::from_be((*sin).sin_addr.s_addr))
}

/// The address devices on this machine's network reach it at, for the pairing
/// flows to advertise (`None` with no network at all).
pub fn lan_ip() -> Option<String> {
    let egress = egress_ip()?;
    #[cfg(unix)]
    let egress = lan_for(egress, &unix_ipv4_ifaces());
    Some(egress.to_string())
}

/// The local address internet traffic leaves from. Connecting a UDP socket
/// only picks the route; nothing is sent.
fn egress_ip() -> Option<Ipv4Addr> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:80").ok()?; // TEST-NET-1: non-routable, never leaves the host
    match sock.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) => Some(ip),
        std::net::IpAddr::V6(_) => None,
    }
}

/// A full-tunnel VPN carries internet traffic, so `egress` is then the
/// tunnel's own address, which nothing on the local network can reach. The
/// first private address on a real interface is the one that can.
#[cfg(unix)]
fn lan_for(egress: Ipv4Addr, ifaces: &[(Ipv4Addr, i32)]) -> Ipv4Addr {
    let tunnel = |flags: i32| flags & libc::IFF_POINTOPOINT != 0;
    if !ifaces
        .iter()
        .any(|&(ip, flags)| ip == egress && tunnel(flags))
    {
        return egress;
    }
    ifaces
        .iter()
        .find(|&&(ip, flags)| {
            ip.is_private()
                && flags & libc::IFF_UP != 0
                && flags & libc::IFF_LOOPBACK == 0
                && !tunnel(flags)
        })
        .map_or(egress, |&(ip, _)| ip)
}

/// This machine's Tailscale IPv4, if a tailnet interface is up. Tailscale hands
/// out addresses from the 100.64.0.0/10 CGNAT range, so the interface list is
/// enough — no dependency on the `tailscale` CLI being on PATH.
pub fn tailscale_ip() -> Option<String> {
    ipv4_addrs()
        .into_iter()
        .find(is_tailscale)
        .map(|ip| ip.to_string())
}

fn is_tailscale(ip: &Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (64..=127).contains(&o[1])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_cgnat_range_is_tailscale() {
        assert!(is_tailscale(&Ipv4Addr::new(100, 64, 0, 1)));
        assert!(is_tailscale(&Ipv4Addr::new(100, 127, 255, 254)));
        assert!(!is_tailscale(&Ipv4Addr::new(100, 63, 0, 1)));
        assert!(!is_tailscale(&Ipv4Addr::new(100, 128, 0, 1)));
        assert!(!is_tailscale(&Ipv4Addr::new(192, 168, 1, 10)));
    }

    #[cfg(unix)]
    #[test]
    fn a_full_tunnel_vpn_address_gives_way_to_the_local_network() {
        let up = libc::IFF_UP;
        let wifi = Ipv4Addr::new(192, 168, 50, 198);
        let vpn = Ipv4Addr::new(192, 168, 101, 41);
        let ifaces = [
            (Ipv4Addr::LOCALHOST, up | libc::IFF_LOOPBACK),
            (wifi, up | libc::IFF_BROADCAST),
            (vpn, up | libc::IFF_POINTOPOINT),
        ];
        assert_eq!(lan_for(vpn, &ifaces), wifi);
        assert_eq!(lan_for(wifi, &ifaces), wifi);
        assert_eq!(lan_for(vpn, &ifaces[2..]), vpn);
    }

    #[test]
    fn the_loopback_interface_is_listed() {
        assert!(ipv4_addrs().contains(&Ipv4Addr::LOCALHOST));
    }
}
