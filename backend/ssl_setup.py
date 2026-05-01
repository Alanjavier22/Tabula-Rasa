import os
import socket
import trustme
from cryptography import x509
from cryptography.hazmat.backends import default_backend

CERTS_DIR = os.path.join(os.path.dirname(__file__), "certs")

def get_local_ip() -> str:
    """Detect the local IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def check_cert_ip(cert_path: str, ip: str) -> bool:
    """Check if the given IP is in the Subject Alternative Names of the cert."""
    if not os.path.exists(cert_path):
        return False
    try:
        with open(cert_path, "rb") as f:
            cert_data = f.read()
        cert = x509.load_pem_x509_certificate(cert_data, default_backend())
        ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        names = ext.value.get_values_for_type(x509.IPAddress)
        for name in names:
            if str(name) == ip:
                return True
    except Exception as e:
        print(f"Error checking cert: {e}")
        return False
    return False

def ensure_certs() -> str:
    """Ensure that valid SSL certificates exist for the current local IP."""
    os.makedirs(CERTS_DIR, exist_ok=True)
    
    ca_pem = os.path.join(CERTS_DIR, "ca.pem")
    ca_key = os.path.join(CERTS_DIR, "ca.key")
    server_pem = os.path.join(CERTS_DIR, "server.pem")
    server_key = os.path.join(CERTS_DIR, "server.key")
    
    local_ip = get_local_ip()
    
    if os.path.exists(ca_pem) and os.path.exists(ca_key):
        print("Loading existing CA...")
        try:
            with open(ca_pem, "rb") as f:
                ca_cert_bytes = f.read()
            with open(ca_key, "rb") as f:
                ca_key_bytes = f.read()
            ca = trustme.CA.from_pem(ca_cert_bytes, ca_key_bytes)
        except Exception as e:
            print(f"Failed to load existing CA: {e}. Generating new one.")
            ca = trustme.CA()
            ca.cert_pem.write_to_path(ca_pem)
            ca.private_key_pem.write_to_path(ca_key)
    else:
        print("Generating new CA...")
        ca = trustme.CA()
        ca.cert_pem.write_to_path(ca_pem)
        ca.private_key_pem.write_to_path(ca_key)
        
    if not check_cert_ip(server_pem, local_ip) or not os.path.exists(server_key):
        print(f"Generating new server certificate for IP {local_ip}...")
        # We add localhost, 127.0.0.1 and the local_ip
        server_cert = ca.issue_cert(
            "localhost",
            "127.0.0.1",
            local_ip,
        )
        with open(server_pem, "wb") as f:
            for blob in server_cert.cert_chain_pems:
                f.write(blob.bytes())
        server_cert.private_key_pem.write_to_path(server_key)
    else:
        print(f"Valid server certificate found for IP {local_ip}.")
        
    return local_ip

if __name__ == "__main__":
    ip = ensure_certs()
    print(f"Certificates ready for: https://{ip}:8000")
