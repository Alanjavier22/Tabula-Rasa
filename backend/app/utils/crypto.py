import logging
from cryptography.fernet import Fernet, InvalidToken
from app import security_config

crypto_logger = logging.getLogger(__name__)
FERNET_TOKEN_PREFIX = "gAAAAAB"


def _get_fernet() -> Fernet:
    if not security_config.ENCRYPTION_KEY:
        raise RuntimeError("CONFIG_ENCRYPTION_KEY no está configurada")
    return Fernet(security_config.ENCRYPTION_KEY.encode())


def encrypt_value(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    """Descifra `token`. Si no es un Fernet token válido (valor legacy en texto
    plano de instalaciones existentes), lo devuelve tal cual sin fallar."""
    return decrypt_value_with_status(token)[0]


def decrypt_value_with_status(token: str) -> tuple[str, bool]:
    """Igual que decrypt_value, pero además indica si `token` ya estaba cifrado.
    Si el valor ya parece un token Fernet (`gAAAAAB...`) pero no puede descifrarse
    con la clave activa, NO se trata como texto plano legacy para evitar
    re-cifrados recursivos sobre un ciphertext previo."""
    try:
        return _get_fernet().decrypt(token.encode()).decode(), True
    except (InvalidToken, ValueError):
        if token.startswith(FERNET_TOKEN_PREFIX):
            crypto_logger.warning(
                "[CRYPTO] Token Fernet no pudo descifrarse con la CONFIG_ENCRYPTION_KEY activa"
            )
            return "", True
        return token, False
