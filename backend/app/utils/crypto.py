from cryptography.fernet import Fernet, InvalidToken
from app import security_config


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
    Útil para self-healing: si `was_encrypted` es False, el caller puede
    re-escribir el valor cifrado para que la próxima lectura ya lo encuentre así."""
    try:
        return _get_fernet().decrypt(token.encode()).decode(), True
    except (InvalidToken, ValueError):
        return token, False
