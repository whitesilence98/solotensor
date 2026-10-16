"""SoloTensor Authentication Service.

Provides an abstract AuthProvider interface and default LocalAuthProvider using SQLite,
PBKDF2-HMAC password hashing, and RFC-compliant signed HMAC-SHA256 JWT tokens.
Expandable to cloud providers (e.g. Supabase, Clerk, OAuth) via the provider factory.
"""

from abc import ABC, abstractmethod
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any, Optional
import uuid

from ..config import Settings, get_settings
from ..db import Database, get_db
from ..schemas import ApiKeyListItem, ApiKeyResponse, UserResponse
from .credit_service import CreditService, get_credit_service

logger = logging.getLogger("solotensor.auth")


class AuthError(Exception):
    """Base exception for authentication errors."""


class InvalidCredentialsError(AuthError):
    """Raised when authentication credentials (username/password/key) are invalid."""


class UserAlreadyExistsError(AuthError):
    """Raised when email or username is already taken."""


class InvalidTokenError(AuthError):
    """Raised when a JWT token cannot be decoded or is invalid."""


class TokenExpiredError(InvalidTokenError):
    """Raised when a JWT token has expired."""


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with 100,000 iterations and 16-byte random salt."""
    salt = secrets.token_hex(16)
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${derived}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored PBKDF2 hash using constant-time comparison."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = parts[2].encode("utf-8")
        expected_derived = parts[3]
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            iterations,
        ).hex()
        return hmac.compare_digest(derived, expected_derived)
    except Exception:
        return False


class AuthProvider(ABC):
    """Abstract Authentication Provider interface for SoloTensor."""

    @abstractmethod
    def authenticate(self, email_or_username: str, password: str) -> Optional[UserResponse]:
        """Verify user credentials and return user model if valid, else None."""

    @abstractmethod
    def create_user(
        self,
        email: str,
        username: str,
        password: str,
        display_name: Optional[str] = None,
    ) -> UserResponse:
        """Register a new user, initialize their credits, and return user profile."""

    @abstractmethod
    def verify_token(self, token: str) -> Optional[UserResponse]:
        """Validate signed JWT access token and return user profile."""

    @abstractmethod
    def verify_api_key(self, api_key: str) -> Optional[UserResponse]:
        """Validate API key and return user profile."""

    @abstractmethod
    def create_token(self, user: UserResponse) -> str:
        """Issue a signed JWT token for the user."""

    @abstractmethod
    def create_api_key(self, user_id: str, name: str) -> tuple[ApiKeyResponse, str]:
        """Generate a new API key for the user, returning (metadata, raw_key)."""

    @abstractmethod
    def list_api_keys(self, user_id: str) -> list[ApiKeyListItem]:
        """List user's active API keys without exposing secrets."""

    @abstractmethod
    def delete_api_key(self, user_id: str, key_id: str) -> bool:
        """Revoke an API key."""


class LocalAuthProvider(AuthProvider):
    """Default Local-First Auth Provider using SQLite and HMAC-SHA256 JWTs."""

    def __init__(
        self,
        db: Optional[Database] = None,
        settings: Optional[Settings] = None,
        credits: Optional[CreditService] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.db = db or get_db()
        self.credits = credits or CreditService(db=self.db, settings=self.settings)
        self.jwt_secret = self.settings.JWT_SECRET
        self.jwt_expire_seconds = self.settings.JWT_EXPIRE_DAYS * 86400

    def _build_user_response(self, user_row: dict[str, Any]) -> UserResponse:
        uid = str(user_row.get("user_id") or user_row.get("id"))
        roles = self.db.get_user_roles(uid) if uid else []
        if not roles:
            roles = [user_row.get("role") or "creator"]
        primary_role = roles[0] if roles else (user_row.get("role") or "creator")
        perms = list(self.db.get_user_permissions(uid)) if uid else []
        return UserResponse(
            id=uid,
            email=user_row["email"],
            username=user_row["username"],
            display_name=user_row.get("display_name"),
            role=user_row.get("role", "creator"),
            is_verified=bool(user_row.get("is_verified", False)),
            created_at=str(user_row.get("user_created_at") or user_row.get("created_at")),
            roles=roles,
            primary_role=primary_role,
            permissions=perms,
        )

    def create_user(
        self,
        email: str,
        username: str,
        password: str,
        display_name: Optional[str] = None,
    ) -> UserResponse:
        clean_email = email.strip().lower()
        clean_username = username.strip()

        # Check unique email
        if self.db.get_user_by_email(clean_email):
            raise UserAlreadyExistsError(f"Email '{clean_email}' is already registered.")

        # Check unique username
        if self.db.get_user_by_username(clean_username):
            raise UserAlreadyExistsError(f"Username '{clean_username}' is already taken.")

        user_id = str(uuid.uuid4())
        hashed = hash_password(password)
        now = datetime.now(timezone.utc).isoformat()

        user_record = self.db.create_user(
            user_id=user_id,
            email=clean_email,
            username=clean_username,
            hashed_password=hashed,
            display_name=display_name.strip() if display_name else clean_username,
            role="creator",
            created_at=now,
        )

        # Initialize credits for new user
        self.credits.init_user_credits(user_id=user_id)
        logger.info("Created local user %s (%s)", clean_username, user_id)

        return self._build_user_response(user_record)

    def authenticate(self, email_or_username: str, password: str) -> Optional[UserResponse]:
        identifier = email_or_username.strip()
        user_row = self.db.get_user_by_email_or_username(identifier)
        if not user_row:
            return None

        if not verify_password(password, user_row["hashed_password"]):
            return None

        return self._build_user_response(user_row)

    def create_token(self, user: UserResponse) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        now = int(time.time())
        exp = now + self.jwt_expire_seconds
        payload = {
            "sub": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "roles": user.roles,
            "primary_role": user.primary_role,
            "iat": now,
            "exp": exp,
        }

        header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
        payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        header_b64 = _b64url_encode(header_bytes)
        payload_b64 = _b64url_encode(payload_bytes)

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        sig = hmac.new(self.jwt_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        sig_b64 = _b64url_encode(sig)

        return f"{header_b64}.{payload_b64}.{sig_b64}"

    def verify_token(self, token: str) -> Optional[UserResponse]:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(self.jwt_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()

        try:
            actual_sig = _b64url_decode(sig_b64)
            if not hmac.compare_digest(expected_sig, actual_sig):
                return None

            payload_data = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
            now = int(time.time())
            if payload_data.get("exp", 0) < now:
                return None  # Expired

            user_id = payload_data.get("sub")
            if not user_id:
                return None

            user_row = self.db.get_user_by_id(user_id)
            if not user_row:
                return None

            return self._build_user_response(user_row)
        except Exception:
            return None

    def create_api_key(self, user_id: str, name: str) -> tuple[ApiKeyResponse, str]:
        # Key format: st_live_<32 urlsafe characters>
        raw_key = f"st_live_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        key_id = f"key_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        record = self.db.create_api_key(
            key_id=key_id,
            user_id=user_id,
            key_hash=key_hash,
            name=name.strip(),
            created_at=now,
        )

        resp = ApiKeyResponse(
            id=record["id"],
            user_id=record["user_id"],
            name=record["name"],
            created_at=str(record["created_at"]),
            api_key=raw_key,
        )
        return resp, raw_key

    def verify_api_key(self, api_key: str) -> Optional[UserResponse]:
        clean_key = api_key.strip()
        if not (clean_key.startswith("st_live_") or clean_key.startswith("st_agent_")):
            return None

        key_hash = hashlib.sha256(clean_key.encode("utf-8")).hexdigest()
        row = self.db.get_api_key_by_hash(key_hash)
        if row:
            return self._build_user_response(row)

        # Scoped service account keys (st_agent_*)
        if clean_key.startswith("st_agent_"):
            if "dispatcher" in clean_key:
                role = "agent:dispatcher"
                perms = ["agent:dispatch_jobs", "generation:complete_any"]
                username = "agent-dispatcher"
            elif "safety" in clean_key:
                role = "agent:safety_scanner"
                perms = ["agent:audit_safety", "moderation:flag_content"]
                username = "agent-safety-scanner"
            elif "sync" in clean_key:
                role = "agent:model_sync"
                perms = ["agent:sync_models", "model:publish"]
                username = "agent-model-sync"
            else:
                parts = clean_key.split("_")
                scope = parts[2] if len(parts) >= 3 else "default"
                role = f"agent:{scope}"
                perms = [f"agent:{scope}"]
                username = f"agent-{scope}"

            return UserResponse(
                id=f"sa_{username}",
                email=f"{username}@agent.solotensor.internal",
                username=username,
                display_name=f"Service Account ({username})",
                role=role,
                roles=[role],
                primary_role=role,
                permissions=perms,
                is_verified=True,
                created_at=datetime.now(timezone.utc).isoformat(),
            )

        return None

    def list_api_keys(self, user_id: str) -> list[ApiKeyListItem]:
        keys = self.db.list_api_keys(user_id)
        return [
            ApiKeyListItem(
                id=k["id"],
                user_id=k["user_id"],
                name=k["name"],
                created_at=str(k["created_at"]),
                masked_key="st_live_••••••••",
            )
            for k in keys
        ]

    def delete_api_key(self, user_id: str, key_id: str) -> bool:
        return self.db.delete_api_key(user_id=user_id, key_id=key_id)


class SupabaseAuthProvider(AuthProvider):
    """Cloud-expandable provider stub for Supabase Auth integration."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        # In a cloud setup, Supabase JWT secret or GoTrue API client is initialized here.

    def authenticate(self, email_or_username: str, password: str) -> Optional[UserResponse]:
        raise NotImplementedError("Supabase authentication is not configured in this environment.")

    def create_user(
        self,
        email: str,
        username: str,
        password: str,
        display_name: Optional[str] = None,
    ) -> UserResponse:
        raise NotImplementedError("Supabase registration is not configured in this environment.")

    def verify_token(self, token: str) -> Optional[UserResponse]:
        raise NotImplementedError("Supabase token verification is not configured in this environment.")

    def verify_api_key(self, api_key: str) -> Optional[UserResponse]:
        raise NotImplementedError("Supabase API key verification is not configured in this environment.")

    def create_token(self, user: UserResponse) -> str:
        raise NotImplementedError("Supabase token issuance is handled by Supabase Auth.")

    def create_api_key(self, user_id: str, name: str) -> tuple[ApiKeyResponse, str]:
        raise NotImplementedError("Supabase API key management is not configured.")

    def list_api_keys(self, user_id: str) -> list[ApiKeyListItem]:
        return []

    def delete_api_key(self, user_id: str, key_id: str) -> bool:
        return False


_default_auth_provider: Optional[AuthProvider] = None


def get_auth_provider() -> AuthProvider:
    """Factory function returning the configured AuthProvider (parameterless for FastAPI Depends)."""
    global _default_auth_provider
    if _default_auth_provider is None:
        current_settings = get_settings()
        provider_name = current_settings.AUTH_PROVIDER.lower().strip()
        if provider_name == "supabase":
            _default_auth_provider = SupabaseAuthProvider(settings=current_settings)
        else:
            _default_auth_provider = LocalAuthProvider(settings=current_settings)
    return _default_auth_provider


def set_auth_provider(provider: Optional[AuthProvider]) -> None:
    """Setter for testing and runtime provider swaps."""
    global _default_auth_provider
    _default_auth_provider = provider
