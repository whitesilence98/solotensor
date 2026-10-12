"""SQLite database layer for SoloTensor authentication, user identity, and credits."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import logging
from pathlib import Path
import secrets
import sqlite3
from typing import Any, Generator, Optional
import uuid

from .config import Settings, get_settings
from fastapi import Depends

logger = logging.getLogger("solotensor.db")


class Database:
    """SQLite Database manager for SoloTensor local-first storage."""

    def __init__(self, db_path: Optional[str | Path] = None, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        raw_path = db_path or self.settings.DB_PATH
        path = Path(raw_path)
        if not path.is_absolute():
            # Resolve relative to backend root directory
            backend_root = Path(__file__).parent.parent.resolve()
            path = (backend_root / path).resolve()
        self.db_path = path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Provide a SQLite connection configured with Row factory and WAL mode."""
        conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=30.0,
            isolation_level=None,  # Autocommit mode; transactions managed via BEGIN/COMMIT
        )
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            yield conn
        finally:
            conn.close()

    def init_db(self) -> None:
        """Create tables and indexes if they do not exist."""
        with self.get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    display_name TEXT,
                    hashed_password TEXT NOT NULL,
                    role TEXT DEFAULT 'creator',
                    is_verified INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            # Auto-migrate is_verified if users table already existed
            cursor = conn.execute("PRAGMA table_info(users);")
            cols = [r["name"] for r in cursor.fetchall()]
            if "is_verified" not in cols:
                conn.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_credits (
                    user_id TEXT PRIMARY KEY,
                    balance INTEGER DEFAULT 100,
                    daily_allowance INTEGER DEFAULT 100,
                    last_claimed_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    key_hash TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    token_type TEXT NOT NULL,
                    otp_code TEXT,
                    expires_at TIMESTAMP NOT NULL,
                    used_at TIMESTAMP,
                    created_at TIMESTAMP NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_tokens_otp ON auth_tokens(user_id, otp_code, token_type);")
            logger.info("Initialized SoloTensor SQLite schema at %s", self.db_path)

    # --- User operations ----------------------------------------------------

    def create_user(
        self,
        user_id: str,
        email: str,
        username: str,
        hashed_password: str,
        display_name: Optional[str] = None,
        role: str = "creator",
        is_verified: int = 0,
        created_at: Optional[str] = None,
    ) -> dict[str, Any]:
        ts = created_at or datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, username, display_name, hashed_password, role, is_verified, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, email.lower(), username, display_name, hashed_password, role, int(is_verified), ts),
            )
        return {
            "id": user_id,
            "email": email.lower(),
            "username": username,
            "display_name": display_name,
            "role": role,
            "is_verified": bool(is_verified),
            "created_at": ts,
        }

    def get_user_by_id(self, user_id: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, created_at FROM users WHERE id = ?",
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["is_verified"] = bool(data.get("is_verified", 0))
            return data

    def get_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, created_at FROM users WHERE lower(email) = lower(?)",
                (email,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["is_verified"] = bool(data.get("is_verified", 0))
            return data

    def get_user_by_username(self, username: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, created_at FROM users WHERE lower(username) = lower(?)",
                (username,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["is_verified"] = bool(data.get("is_verified", 0))
            return data

    def get_user_by_email_or_username(self, identifier: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, email, username, display_name, hashed_password, role, is_verified, created_at
                FROM users
                WHERE lower(email) = lower(?) OR lower(username) = lower(?)
                """,
                (identifier, identifier),
            )
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["is_verified"] = bool(data.get("is_verified", 0))
            return data

    def verify_user(self, user_id: str) -> bool:
        """Mark user's email as verified."""
        with self.get_connection() as conn:
            cursor = conn.execute("UPDATE users SET is_verified = 1 WHERE id = ?", (user_id,))
            return cursor.rowcount > 0

    def update_user_password(self, user_id: str, hashed_password: str) -> bool:
        """Update password hash for user."""
        with self.get_connection() as conn:
            cursor = conn.execute("UPDATE users SET hashed_password = ? WHERE id = ?", (hashed_password, user_id))
            return cursor.rowcount > 0

    # --- Auth Tokens (Verification & Password Reset) ------------------------

    def create_auth_token(
        self,
        user_id: str,
        token_type: str,
        expires_in_seconds: int = 86400,
        otp_code: Optional[str] = None,
        token: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a single-use verification or password reset token and 6-digit OTP code."""
        token_id = f"tok_{uuid.uuid4().hex[:16]}"
        raw_token = token or secrets.token_urlsafe(32)
        raw_otp = otp_code or f"{secrets.randbelow(900000) + 100000}"
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=expires_in_seconds)).isoformat()
        created_at = now.isoformat()

        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO auth_tokens (id, user_id, token, token_type, otp_code, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (token_id, user_id, raw_token, token_type, raw_otp, expires_at, created_at),
            )
        return {
            "id": token_id,
            "user_id": user_id,
            "token": raw_token,
            "token_type": token_type,
            "otp_code": raw_otp,
            "expires_at": expires_at,
            "created_at": created_at,
        }

    def get_auth_token(self, token: str, token_type: str) -> Optional[dict[str, Any]]:
        """Look up an unused auth token by token string and type."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, user_id, token, token_type, otp_code, expires_at, used_at, created_at
                FROM auth_tokens
                WHERE token = ? AND token_type = ? AND used_at IS NULL
                """,
                (token, token_type),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_auth_token_by_otp(self, user_id: str, otp_code: str, token_type: str) -> Optional[dict[str, Any]]:
        """Look up latest unused auth token for user matching 6-digit OTP code."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, user_id, token, token_type, otp_code, expires_at, used_at, created_at
                FROM auth_tokens
                WHERE user_id = ? AND otp_code = ? AND token_type = ? AND used_at IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (user_id, otp_code.strip(), token_type),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def mark_auth_token_used(self, token_id: str) -> bool:
        """Mark token as consumed."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            cursor = conn.execute(
                "UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL",
                (now, token_id),
            )
            return cursor.rowcount > 0

    # --- User Credits operations --------------------------------------------

    def create_credits(
        self,
        user_id: str,
        balance: int = 100,
        daily_allowance: int = 100,
        last_claimed_at: Optional[str] = None,
        updated_at: Optional[str] = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        ts_claim = last_claimed_at or now
        ts_update = updated_at or now
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_credits (user_id, balance, daily_allowance, last_claimed_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, balance, daily_allowance, ts_claim, ts_update),
            )
        return {
            "user_id": user_id,
            "balance": balance,
            "daily_allowance": daily_allowance,
            "last_claimed_at": ts_claim,
            "updated_at": ts_update,
        }

    def get_credits(self, user_id: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT user_id, balance, daily_allowance, last_claimed_at, updated_at FROM user_credits WHERE user_id = ?",
                (user_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_credits(
        self,
        user_id: str,
        balance: Optional[int] = None,
        daily_allowance: Optional[int] = None,
        last_claimed_at: Optional[str] = None,
        updated_at: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        now = updated_at or datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            # Fetch current
            cursor = conn.execute("SELECT * FROM user_credits WHERE user_id = ?", (user_id,))
            current = cursor.fetchone()
            if not current:
                return None
            new_balance = balance if balance is not None else current["balance"]
            new_allowance = daily_allowance if daily_allowance is not None else current["daily_allowance"]
            new_last_claim = last_claimed_at if last_claimed_at is not None else current["last_claimed_at"]

            conn.execute(
                """
                UPDATE user_credits
                SET balance = ?, daily_allowance = ?, last_claimed_at = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (new_balance, new_allowance, new_last_claim, now, user_id),
            )
            return {
                "user_id": user_id,
                "balance": new_balance,
                "daily_allowance": new_allowance,
                "last_claimed_at": new_last_claim,
                "updated_at": now,
            }

    def deduct_credits(self, user_id: str, amount: int = 2) -> bool:
        """Atomically deduct credits if balance >= amount. Returns True if successful, False otherwise."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE user_credits
                SET balance = balance - ?, updated_at = ?
                WHERE user_id = ? AND balance >= ?
                """,
                (amount, now, user_id, amount),
            )
            return cursor.rowcount > 0

    # --- API Keys operations ------------------------------------------------

    def create_api_key(
        self,
        key_id: str,
        user_id: str,
        key_hash: str,
        name: str,
        created_at: Optional[str] = None,
    ) -> dict[str, Any]:
        ts = created_at or datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO api_keys (id, user_id, key_hash, name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key_id, user_id, key_hash, name, ts),
            )
        return {
            "id": key_id,
            "user_id": user_id,
            "name": name,
            "created_at": ts,
        }

    def get_api_key_by_hash(self, key_hash: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT k.id, k.user_id, k.key_hash, k.name, k.created_at,
                       u.email, u.username, u.display_name, u.role, u.created_at as user_created_at
                FROM api_keys k
                JOIN users u ON k.user_id = u.id
                WHERE k.key_hash = ?
                """,
                (key_hash,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_api_keys(self, user_id: str) -> list[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, user_id, name, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            )
            return [dict(r) for r in cursor.fetchall()]

    def delete_api_key(self, user_id: str, key_id: str) -> bool:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
                (key_id, user_id),
            )
            return cursor.rowcount > 0


_default_db: Optional[Database] = None


def get_db() -> Database:
    """Singleton getter for Database."""
    global _default_db
    if _default_db is None:
        _default_db = Database()
    return _default_db


def set_db(db: Optional[Database]) -> None:
    """Setter for testing and runtime database mocks."""
    global _default_db
    _default_db = db
