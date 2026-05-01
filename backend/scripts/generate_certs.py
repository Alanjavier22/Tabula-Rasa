#!/usr/bin/env python3
"""
FASE 8: TLS Certificate Generator
Generates self-signed certificates for local HTTPS
"""
import sys
import os
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

def generate_self_signed_cert():
    """Generate self-signed certificate and private key for local HTTPS."""
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )
    
    # Generate subject name
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "EC"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Pichincha"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Quito"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Tabula Rasa Finance"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])
    
    # Generate certificate
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        private_key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.now(timezone.utc)
    ).not_valid_after(
        datetime.now(timezone.utc) + timedelta(days=3650)  # 10 years validity
    ).add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName("localhost"),
            x509.DNSName("127.0.0.1"),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            x509.IPAddress(ipaddress.IPv4Address("0.0.0.0")),
        ]),
        critical=False,
    ).sign(private_key, hashes.SHA256(), default_backend())
    
    # Write certificate and key to files
    cert_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")
    
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
    
    print(f"[FASE-8] TLS certificate generated successfully:")
    print(f"  Certificate: {cert_path}")
    print(f"  Private Key: {key_path}")
    print(f"  Valid for: 10 years")
    print(f"  Common Name: localhost")

if __name__ == "__main__":
    try:
        import ipaddress
        generate_self_signed_cert()
    except ImportError as e:
        print(f"[FASE-8] Error: Missing required library - {e}")
        print("Please install: pip install cryptography")
        sys.exit(1)
