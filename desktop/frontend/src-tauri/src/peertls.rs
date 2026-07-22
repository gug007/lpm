// Client-side TLS for the Mac-to-Mac peer channel (peer.rs / peerclient.rs).
//
// The peer host presents this Mac's own self-signed leaf — the SAME certificate
// the mobile server uses (see remotetls.rs); there is never a second identity.
// This module is the CLIENT half: rustls `ClientConfig`s that pin the host's leaf
// by SHA-256 (exactly like the phone), plus the transport-detection helper the
// host uses to tell a TLS ClientHello from a legacy plaintext WebSocket handshake
// on the shared listener.
//
// Two verifiers, both deliberately bypassing rustls' PKI (no CA chain, no
// hostname, no expiry — the leaf is self-signed and long-lived, trust is the
// pinned fingerprint alone):
//   - Pinned: accept ONLY the leaf whose sha256(DER) equals the expected value.
//   - Capturing: accept any leaf but record its fingerprint, so the client can
//     pin-after-auth an entry that predates pinning (trust-on-first-use).

use std::sync::{Arc, Mutex};

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::CryptoProvider;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error as TlsError, SignatureScheme};
use sha2::{Digest, Sha256};

/// First byte of a TLS record is the handshake content type (0x16). A legacy
/// plaintext peer opens with an HTTP/WebSocket upgrade — `GET …` (0x47) — so the
/// host can pick the transport from one peeked byte.
pub fn sniff_is_tls(first_byte: u8) -> bool {
    first_byte == 0x16
}

/// Lowercase hex SHA-256 of a certificate's DER bytes — the value carried in the
/// pairing invite (`f`) and stored as a peer's `tlsFp`. Matches
/// `remotetls::fingerprint()`, which hashes this Mac's own leaf DER.
pub fn cert_fingerprint(der: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(der);
    hex::encode(h.finalize())
}

fn crypto_provider() -> Arc<CryptoProvider> {
    Arc::new(rustls::crypto::aws_lc_rs::default_provider())
}

/// The SNI/name handed to rustls for a peer dial. Both verifiers ignore it (and
/// the host's single-cert config ignores SNI), so a fixed name matching the leaf
/// CN is enough — the peer address is an IP, never a DNS name we validate.
pub fn server_name() -> ServerName<'static> {
    ServerName::try_from("lpm").expect("static server name")
}

/// A client config that trusts exactly one leaf: the cert whose sha256(DER) equals
/// `fp`. Any other cert (a rotated host, a MITM) fails the handshake.
pub fn pinned_client_config(fp: &str) -> Arc<ClientConfig> {
    let provider = crypto_provider();
    let verifier = Arc::new(PinnedVerifier {
        provider: provider.clone(),
        want_fp: fp.to_lowercase(),
    });
    build_client_config(provider, verifier)
}

/// A client config that accepts any leaf and records its fingerprint into `slot`,
/// for pin-after-auth on an unpinned entry. Trust for THIS handshake is
/// unconditional — the caller only pins once the host also proves the shared token
/// (auth), so a stranger who answers the port never gets pinned.
pub fn capturing_client_config(slot: Arc<Mutex<Option<String>>>) -> Arc<ClientConfig> {
    let provider = crypto_provider();
    let verifier = Arc::new(CapturingVerifier {
        provider: provider.clone(),
        slot,
    });
    build_client_config(provider, verifier)
}

fn build_client_config(
    provider: Arc<CryptoProvider>,
    verifier: Arc<dyn ServerCertVerifier>,
) -> Arc<ClientConfig> {
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("client protocol versions")
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    Arc::new(config)
}

#[derive(Debug)]
struct PinnedVerifier {
    provider: Arc<CryptoProvider>,
    want_fp: String,
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        let got = cert_fingerprint(end_entity.as_ref());
        if got == self.want_fp {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(TlsError::General("peer certificate fingerprint mismatch".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

#[derive(Debug)]
struct CapturingVerifier {
    provider: Arc<CryptoProvider>,
    slot: Arc<Mutex<Option<String>>>,
}

impl ServerCertVerifier for CapturingVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        *self.slot.lock().unwrap() = Some(cert_fingerprint(end_entity.as_ref()));
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::pki_types::{PrivateKeyDer, PrivatePkcs8KeyDer};
    use rustls::ServerConfig;
    use std::net::{TcpListener, TcpStream};
    use std::time::Duration;
    use tungstenite::Message;

    // A generated self-signed leaf plus a rustls ServerConfig that presents it and
    // the lowercase-hex fingerprint of its DER.
    fn gen_server(cn: &str) -> (Arc<ServerConfig>, Vec<u8>, String) {
        use rcgen::{CertificateParams, KeyPair, PKCS_ECDSA_P256_SHA256};
        let params = CertificateParams::new(vec![cn.to_string()]).unwrap();
        let key = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).unwrap();
        let cert = params.self_signed(&key).unwrap();
        let der = cert.der().to_vec();
        let fp = cert_fingerprint(&der);
        let certs = vec![CertificateDer::from(der.clone())];
        let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key.serialize_der()));
        let config = ServerConfig::builder_with_provider(crypto_provider())
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(certs, key_der)
            .unwrap();
        (Arc::new(config), der, fp)
    }

    #[test]
    fn sniff_distinguishes_tls_from_ws_get() {
        assert!(sniff_is_tls(0x16)); // TLS handshake record
        assert!(!sniff_is_tls(b'G')); // "GET " — a plaintext WebSocket upgrade
        assert!(!sniff_is_tls(0x00));
    }

    #[test]
    fn fingerprint_is_lowercase_hex_sha256_of_der() {
        // Known vector: sha256("") — the fingerprint of an empty DER, so the
        // helper is exercised against a value independent of the code under test.
        let fp = cert_fingerprint(b"");
        assert_eq!(
            fp,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(fp.len(), 64);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn pinned_verifier_accepts_match_rejects_other() {
        let (_c1, der1, fp1) = gen_server("lpm");
        let (_c2, _der2, fp2) = gen_server("lpm");
        let cert1 = CertificateDer::from(der1);
        let now = UnixTime::now();
        let name = server_name();

        let good = PinnedVerifier {
            provider: crypto_provider(),
            want_fp: fp1.clone(),
        };
        assert!(good
            .verify_server_cert(&cert1, &[], &name, &[], now)
            .is_ok());

        let bad = PinnedVerifier {
            provider: crypto_provider(),
            want_fp: fp2,
        };
        assert!(bad.verify_server_cert(&cert1, &[], &name, &[], now).is_err());
    }

    #[test]
    fn capturing_verifier_records_leaf_fingerprint() {
        let (_c, der, fp) = gen_server("lpm");
        let cert = CertificateDer::from(der);
        let slot = Arc::new(Mutex::new(None));
        let v = CapturingVerifier {
            provider: crypto_provider(),
            slot: slot.clone(),
        };
        assert!(v
            .verify_server_cert(&cert, &[], &server_name(), &[], UnixTime::now())
            .is_ok());
        assert_eq!(slot.lock().unwrap().as_deref(), Some(fp.as_str()));
    }

    // End-to-end over loopback: a rustls server presenting a test leaf, a tungstenite
    // handshake, and one auth-style frame — proving the pinned client trusts the
    // matching leaf and a client pinned to a DIFFERENT leaf fails the handshake.
    #[test]
    fn loopback_pinned_tls_roundtrips_and_mismatch_fails() {
        let (server_config, _der, fp) = gen_server("lpm");
        let (_other_config, _other_der, other_fp) = gen_server("lpm");
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        let sc = server_config.clone();
        let server = std::thread::spawn(move || {
            // Connection 1: the matching client — complete the WS handshake, read a
            // frame, reply "ready".
            let (s1, _) = listener.accept().unwrap();
            let _ = s1.set_read_timeout(Some(Duration::from_secs(5)));
            let conn = rustls::ServerConnection::new(sc.clone()).unwrap();
            let tls = rustls::StreamOwned::new(conn, s1);
            if let Ok(mut ws) = tungstenite::accept(tls) {
                if let Ok(m) = ws.read() {
                    if m.is_text() {
                        let _ = ws.send(Message::text(r#"{"t":"ready"}"#.to_string()));
                    }
                }
            }
            // Connection 2: the mismatched client — its verifier rejects our leaf, so
            // the server handshake errors too. Consume it and return.
            if let Ok((s2, _)) = listener.accept() {
                let _ = s2.set_read_timeout(Some(Duration::from_secs(5)));
                let conn = rustls::ServerConnection::new(sc.clone()).unwrap();
                let tls = rustls::StreamOwned::new(conn, s2);
                let _ = tungstenite::accept(tls);
            }
        });

        // Matching client: pinned to the server's real fingerprint.
        {
            let mut tcp = TcpStream::connect(addr).unwrap();
            tcp.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut conn = rustls::ClientConnection::new(pinned_client_config(&fp), server_name()).unwrap();
            conn.complete_io(&mut tcp).expect("pinned handshake completes");
            let tls = rustls::StreamOwned::new(conn, tcp);
            let (mut ws, _) = tungstenite::client("ws://127.0.0.1/", tls).expect("ws handshake");
            ws.send(Message::text(r#"{"t":"auth"}"#.to_string())).unwrap();
            let reply = ws.read().unwrap();
            assert!(reply.to_text().unwrap().contains("ready"));
            let _ = ws.close(None);
        }

        // Mismatched client: pinned to a different cert — the handshake must fail and
        // no plaintext leaks.
        {
            let mut tcp = TcpStream::connect(addr).unwrap();
            tcp.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut conn =
                rustls::ClientConnection::new(pinned_client_config(&other_fp), server_name()).unwrap();
            assert!(
                conn.complete_io(&mut tcp).is_err(),
                "a client pinned to the wrong leaf must fail the handshake"
            );
        }

        server.join().unwrap();
    }
}
