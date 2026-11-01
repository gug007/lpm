// A service's `ready` check as the config spells it, and what it resolves to.
// Mirrored by cli/src/ready.rs; the two must accept the same YAML.
//
//   ready: port                      # the service's own `port` accepts connections
//   ready: 4001                      # that port accepts connections
//   ready: http://localhost:3000/up  # the URL answers 2xx
//   ready:
//     log: "ready in"                # a line of the service's output contains this text
//     timeout: 60                    # seconds; 30 when left out
use serde::Deserialize;
use serde_json::{json, Value};
use serde_norway::{Mapping, Value as Yaml};
use std::time::Duration;

pub const DEFAULT_TIMEOUT_SECS: u64 = 30;
pub const MAX_TIMEOUT_SECS: u64 = 3600;

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum ReadySpec {
    Port(i64),
    Text(String),
    Full(Mapping),
    // Anything else still loads the project; it resolves to an error instead.
    Invalid(serde::de::IgnoredAny),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Probe {
    Port(u16),
    Url(String),
    Log(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadyCheck {
    pub probe: Probe,
    pub timeout: Duration,
}

const SHAPE: &str =
    "expected port, a port number, an http(s) URL, or a mapping with one of port, url or log";

fn port_probe(port: i64) -> Result<Probe, String> {
    u16::try_from(port)
        .ok()
        .filter(|p| *p > 0)
        .map(Probe::Port)
        .ok_or_else(|| "port must be from 1 to 65535".to_string())
}

fn own_port(service_port: i64) -> Result<Probe, String> {
    if service_port <= 0 {
        return Err("checking the service's port needs the service to set `port`".into());
    }
    port_probe(service_port)
}

fn is_url(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["http://", "https://"]
        .iter()
        .any(|scheme| lower.starts_with(scheme) && lower.len() > scheme.len())
}

fn url_probe(url: &str) -> Result<Probe, String> {
    let url = url.trim();
    if is_url(url) {
        Ok(Probe::Url(url.to_string()))
    } else {
        Err("url must start with http:// or https://".into())
    }
}

impl ReadySpec {
    pub fn resolve(&self, service_port: i64) -> Result<ReadyCheck, String> {
        let default_timeout = Duration::from_secs(DEFAULT_TIMEOUT_SECS);
        let probe = match self {
            ReadySpec::Port(port) => port_probe(*port)?,
            ReadySpec::Text(text) if text.trim() == "port" => own_port(service_port)?,
            ReadySpec::Text(text) if is_url(text.trim()) => url_probe(text)?,
            ReadySpec::Text(_) | ReadySpec::Invalid(_) => return Err(SHAPE.into()),
            ReadySpec::Full(map) => return resolve_map(map, service_port),
        };
        Ok(ReadyCheck {
            probe,
            timeout: default_timeout,
        })
    }

    /// The check as the service editor reads it back. `port: 0` means the
    /// service's own port.
    pub fn to_json(&self, service_port: i64) -> Value {
        let check = match self.resolve(service_port) {
            Ok(check) => check,
            Err(error) => return json!({ "kind": "invalid", "error": error }),
        };
        let timeout = check.timeout.as_secs();
        match check.probe {
            Probe::Port(port) => {
                let own = match self {
                    ReadySpec::Text(_) => true,
                    ReadySpec::Full(map) => map.get("port") == Some(&Yaml::Bool(true)),
                    _ => false,
                };
                json!({ "kind": "port", "port": if own { 0 } else { port as i64 }, "timeout": timeout })
            }
            Probe::Url(url) => json!({ "kind": "url", "url": url, "timeout": timeout }),
            Probe::Log(text) => json!({ "kind": "log", "log": text, "timeout": timeout }),
        }
    }
}

const KEYS: [&str; 4] = ["port", "url", "log", "timeout"];

fn resolve_map(map: &Mapping, service_port: i64) -> Result<ReadyCheck, String> {
    if let Some(key) = map
        .keys()
        .find(|k| !k.as_str().is_some_and(|k| KEYS.contains(&k)))
    {
        return Err(format!(
            "unknown key {}; expected port, url, log or timeout",
            key_text(key)
        ));
    }
    let set = ["port", "url", "log"]
        .iter()
        .filter(|k| map.contains_key(**k))
        .count();
    if set != 1 {
        return Err("set exactly one of port, url or log".into());
    }
    let probe = if let Some(port) = map.get("port") {
        match port {
            Yaml::Bool(true) => own_port(service_port)?,
            Yaml::Number(n) => port_probe(n.as_i64().unwrap_or(0))?,
            _ => return Err("port must be true or a port number".into()),
        }
    } else if let Some(url) = map.get("url") {
        url_probe(url.as_str().ok_or("url must be a string")?)?
    } else {
        let text = map
            .get("log")
            .and_then(Yaml::as_str)
            .ok_or("log must be a string")?;
        if text.trim().is_empty() {
            return Err("log must not be empty".into());
        }
        Probe::Log(text.to_string())
    };
    let secs = match map.get("timeout") {
        None => DEFAULT_TIMEOUT_SECS,
        Some(t) => t
            .as_i64()
            .filter(|t| (1..=MAX_TIMEOUT_SECS as i64).contains(t))
            .map(|t| t as u64)
            .ok_or_else(|| format!("timeout must be from 1 to {MAX_TIMEOUT_SECS} seconds"))?,
    };
    Ok(ReadyCheck {
        probe,
        timeout: Duration::from_secs(secs),
    })
}

fn key_text(key: &Yaml) -> String {
    key.as_str()
        .map(|k| format!("{k:?}"))
        .unwrap_or_else(|| "(not a string)".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(yaml: &str) -> ReadySpec {
        serde_norway::from_str(yaml).unwrap()
    }

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn short_forms_resolve() {
        assert_eq!(
            parse("port").resolve(4000).unwrap().probe,
            Probe::Port(4000)
        );
        assert_eq!(
            parse("4001").resolve(4000).unwrap().probe,
            Probe::Port(4001)
        );
        let url = parse("http://localhost:3000/health").resolve(0).unwrap();
        assert_eq!(url.probe, Probe::Url("http://localhost:3000/health".into()));
        assert_eq!(url.timeout, secs(DEFAULT_TIMEOUT_SECS));
    }

    #[test]
    fn mapping_forms_resolve_with_their_timeout() {
        let log = parse("log: ready in\ntimeout: 60").resolve(0).unwrap();
        assert_eq!(log.probe, Probe::Log("ready in".into()));
        assert_eq!(log.timeout, secs(60));
        assert_eq!(
            parse("port: true").resolve(5173).unwrap().probe,
            Probe::Port(5173)
        );
        assert_eq!(
            parse("port: 9000").resolve(5173).unwrap().probe,
            Probe::Port(9000)
        );
        assert_eq!(
            parse("url: https://localhost:8443/")
                .resolve(0)
                .unwrap()
                .probe,
            Probe::Url("https://localhost:8443/".into())
        );
    }

    #[test]
    fn own_port_needs_a_service_port() {
        assert!(parse("port").resolve(0).unwrap_err().contains("`port`"));
        assert!(parse("port: true").resolve(0).is_err());
    }

    #[test]
    fn bad_shapes_are_errors_not_load_failures() {
        for yaml in [
            "soon",
            "true",
            "[1, 2]",
            "0",
            "70000",
            "url: localhost:3000",
            "log: '  '",
            "port: false",
            "{}",
            "[1]",
            "prot: 3000",
            "port: 3000\nlog: up",
            "log: up\ntimeout: 0",
            "log: up\ntimeout: 99999",
        ] {
            assert!(
                parse(yaml).resolve(3000).is_err(),
                "{yaml} should not resolve"
            );
        }
    }

    #[test]
    fn editor_json_keeps_own_port_apart_from_a_number() {
        assert_eq!(parse("port").to_json(4000)["port"], 0);
        assert_eq!(parse("port: true").to_json(4000)["port"], 0);
        assert_eq!(parse("4000").to_json(4000)["port"], 4000);
        assert_eq!(
            parse("log: up\ntimeout: 5").to_json(0),
            json!({"kind": "log", "log": "up", "timeout": 5})
        );
        assert_eq!(parse("soon").to_json(0)["kind"], "invalid");
    }
}
