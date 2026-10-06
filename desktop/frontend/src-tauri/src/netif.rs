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
    let mut ifap: *mut libc::ifaddrs = std::ptr::null_mut();
    if unsafe { libc::getifaddrs(&mut ifap) } != 0 {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut cur = ifap;
    while !cur.is_null() {
        let addr = unsafe { (*cur).ifa_addr };
        if !addr.is_null() && unsafe { (*addr).sa_family } as i32 == libc::AF_INET {
            let sin = addr as *const libc::sockaddr_in;
            out.push(Ipv4Addr::from(u32::from_be(unsafe {
                (*sin).sin_addr.s_addr
            })));
        }
        cur = unsafe { (*cur).ifa_next };
    }
    unsafe { libc::freeifaddrs(ifap) };
    out
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

    #[test]
    fn the_loopback_interface_is_listed() {
        assert!(ipv4_addrs().contains(&Ipv4Addr::LOCALHOST));
    }
}
