import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Use JWT_SECRET as the base for encryption key
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")


def _get_fernet():
    """Get Fernet instance from secret key."""
    # Derive a 32-byte key from the secret
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"silentpartner-salt",  # Static salt is OK since we have unique secret
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(SECRET_KEY.encode()))
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key for storage."""
    if not api_key:
        return ""
    f = _get_fernet()
    return f.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key from storage."""
    if not encrypted_key:
        return ""
    try:
        f = _get_fernet()
        return f.decrypt(encrypted_key.encode()).decode()
    except Exception:
        return ""
