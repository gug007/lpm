// TLS material for the mobile remote-control server (remote.rs).
//
// The server speaks wss:// only. It presents one self-signed, long-lived leaf
// certificate (ECDSA P-256, CN "lpm"), persisted as PEM next to remote.json in
// ~/.lpm and generated once on first use — never rotated. Because the leaf is
// stable, the phone pins its SHA-256 on the first successful pair/auth
// (trust-on-first-use); the pairing QR also carries that fingerprint (`f=`) so a
// QR pair can verify the leaf before trusting it.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use sha2::{Digest, Sha256};

const CERT_FILE: &str = "remote-cert.pem";
const KEY_FILE: &str = "remote-key.pem";

pub struct TlsMaterial {
    config: Arc<ServerConfig>,
    fingerprint: String, // lowercase hex sha256 of the leaf certificate DER
}

static MATERIAL: OnceLock<TlsMaterial> = OnceLock::new();

fn material() -> &'static TlsMaterial {
    MATERIAL.get_or_init(load_or_generate)
}

/// The server config every accepted connection is wrapped in before the
/// WebSocket handshake.
pub fn server_config() -> Arc<ServerConfig> {
    material().config.clone()
}

/// Lowercase hex SHA-256 of the leaf certificate DER — the value the pairing QR
/// carries as `f=` and the phone pins.
pub fn fingerprint() -> String {
    material().fingerprint.clone()
}

fn crypto_provider() -> Arc<rustls::crypto::CryptoProvider> {
    Arc::new(rustls::crypto::aws_lc_rs::default_provider())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn material_from(cert_der: Vec<u8>, key: PrivateKeyDer<'static>) -> Result<TlsMaterial, String> {
    let fingerprint = sha256_hex(&cert_der);
    let certs = vec![CertificateDer::from(cert_der)];
    let config = ServerConfig::builder_with_provider(crypto_provider())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| e.to_string())?;
    Ok(TlsMaterial {
        config: Arc::new(config),
        fingerprint,
    })
}

struct Generated {
    cert_pem: String,
    key_pem: String,
    cert_der: Vec<u8>,
    key_der: Vec<u8>, // PKCS#8
}

fn generate() -> Result<Generated, String> {
    use rcgen::{
        CertificateParams, DistinguishedName, DnType, KeyPair, PKCS_ECDSA_P256_SHA256,
    };
    let mut params =
        CertificateParams::new(vec!["lpm".to_string()]).map_err(|e| e.to_string())?;
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "lpm");
    params.distinguished_name = dn;
    let now = time::OffsetDateTime::now_utc();
    params.not_before = now - time::Duration::days(1);
    params.not_after = now + time::Duration::days(365 * 10 + 3);
    let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).map_err(|e| e.to_string())?;
    let cert = params.self_signed(&key_pair).map_err(|e| e.to_string())?;
    Ok(Generated {
        cert_pem: cert.pem(),
        key_pem: key_pair.serialize_pem(),
        cert_der: cert.der().to_vec(),
        key_der: key_pair.serialize_der(),
    })
}

fn generated_material(gen: &Generated) -> Result<TlsMaterial, String> {
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(gen.key_der.clone()));
    material_from(gen.cert_der.clone(), key)
}

fn load(cert_path: &Path, key_path: &Path) -> Result<TlsMaterial, String> {
    let cert_bytes = std::fs::read(cert_path).map_err(|e| e.to_string())?;
    let key_bytes = std::fs::read(key_path).map_err(|e| e.to_string())?;
    let certs: Vec<CertificateDer> = rustls_pemfile::certs(&mut &cert_bytes[..])
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    let leaf = certs.first().ok_or("no certificate in PEM")?.to_vec();
    let key = rustls_pemfile::private_key(&mut &key_bytes[..])
        .map_err(|e| e.to_string())?
        .ok_or("no private key in PEM")?;
    material_from(leaf, key)
}

fn persist(dir: &Path, cert_path: &Path, key_path: &Path, gen: &Generated) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(cert_path, gen.cert_pem.as_bytes()).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(cert_path, std::fs::Permissions::from_mode(0o600));
    std::fs::write(key_path, gen.key_pem.as_bytes()).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600));
    Ok(())
}

fn paths() -> (PathBuf, PathBuf, PathBuf) {
    let dir = crate::config::lpm_dir();
    let cert = dir.join(CERT_FILE);
    let key = dir.join(KEY_FILE);
    (dir, cert, key)
}

fn load_or_generate() -> TlsMaterial {
    // Tests must not read or write the developer's real ~/.lpm, and a throwaway
    // in-memory leaf is enough for the no-verify test client.
    #[cfg(test)]
    {
        let gen = generate().expect("generate test cert");
        return generated_material(&gen).expect("build test material");
    }
    #[cfg(not(test))]
    {
        let (dir, cert_path, key_path) = paths();
        if let Ok(mat) = load(&cert_path, &key_path) {
            return mat;
        }
        let gen = generate().expect("generate remote TLS certificate");
        if let Err(e) = persist(&dir, &cert_path, &key_path, &gen) {
            eprintln!("warning: remote TLS certificate could not be persisted ({e}); using an in-memory certificate for this run");
        }
        generated_material(&gen).expect("build remote TLS material")
    }
}

/// A dangerous client config that accepts any server certificate — for the
/// in-file server tests only. Real clients (the phone) pin the leaf fingerprint.
#[cfg(test)]
pub fn test_client_config() -> Arc<rustls::ClientConfig> {
    let provider = crypto_provider();
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .expect("client protocol versions")
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoVerify(provider)))
        .with_no_client_auth();
    Arc::new(config)
}

#[cfg(test)]
#[derive(Debug)]
struct NoVerify(Arc<rustls::crypto::CryptoProvider>);

#[cfg(test)]
impl rustls::client::danger::ServerCertVerifier for NoVerify {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.0
            .signature_verification_algorithms
            .supported_schemes()
    }
}
