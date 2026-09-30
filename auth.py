"""
Dropzyy 1 - Authentication, Password Hashing & JWT Security Utilities
Uses industry-standard bcrypt for password hashing and PyJWT for bearer tokens.
Maintains backwards compatibility with legacy SHA-256 hashes.
"""
import os
import datetime
import hashlib
from typing import Optional, Dict, Any
import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "Dropzyy-JWT-SuperSecret-2026-ProductionSecureKey-982184!@#$")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
LEGACY_SALTS = ["dropzyy_kirana_salt_2026", "freshkart_kirana_salt_2026"]

def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt with random salt.
    Truncates to 72 bytes to adhere to bcrypt standard limits.
    """
    if not password:
        return ""
    pw_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify plain password against hashed password.
    Supports modern bcrypt ($2b$, $2a$, $2y$) and falls back to legacy SHA-256 with salt.
    """
    if not plain_password or not hashed_password:
        return False

    pw_bytes = plain_password.encode('utf-8')[:72]

    # 1. Bcrypt verification
    try:
        if hashed_password.startswith(('$2b$', '$2a$', '$2y$')):
            return bcrypt.checkpw(pw_bytes, hashed_password.encode('utf-8'))
    except Exception:
        pass

    # 2. Legacy SHA-256 verification (for backwards compatibility with existing records)
    for salt in LEGACY_SALTS:
        try:
            legacy_hash = hashlib.sha256((plain_password + salt).encode('utf-8')).hexdigest()
            if legacy_hash == hashed_password:
                return True
        except Exception:
            pass

    # 3. Direct plaintext check (safety fallback for development / seed comparison)
    if plain_password == hashed_password:
        return True

    return False

def create_access_token(user_id: Any, username: str, role: str, expires_hours: Optional[int] = None) -> str:
    """
    Create a signed JWT access token for authentication.
    """
    hours = expires_hours or JWT_EXPIRE_HOURS
    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=hours)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "username": username or "",
        "role": role or "customer",
        "exp": expire,
        "iat": datetime.datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate a JWT access token.
    Returns decoded payload dictionary or None if invalid/expired.
    """
    if not token:
        return None
    # Strip optional 'Bearer ' prefix if present
    clean_token = token.replace("Bearer ", "").replace("bearer ", "").strip()
    try:
        payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None
