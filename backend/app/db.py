"""SQLite database layer for SoloTensor authentication, user identity, and credits."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
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

            # --- Creator models & generations relational schema -----------------
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS models (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    model_type TEXT NOT NULL,
                    visibility TEXT DEFAULT 'Private',
                    published_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    raw_json TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_versions (
                    id TEXT PRIMARY KEY,
                    model_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP,
                    FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_samples (
                    id TEXT PRIMARY KEY,
                    model_id TEXT NOT NULL,
                    version_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    kind TEXT DEFAULT 'image',
                    stored_name TEXT NOT NULL,
                    url TEXT,
                    metadata TEXT,
                    created_at TIMESTAMP,
                    FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE,
                    FOREIGN KEY(version_id) REFERENCES model_versions(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_files (
                    id TEXT PRIMARY KEY,
                    model_id TEXT NOT NULL,
                    version_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT,
                    precision TEXT,
                    visible INTEGER DEFAULT 1,
                    stored_name TEXT,
                    FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE,
                    FOREIGN KEY(version_id) REFERENCES model_versions(id) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generations (
                    id TEXT PRIMARY KEY,
                    prompt_id TEXT NOT NULL,
                    user_id TEXT,
                    model_id TEXT,
                    version_id TEXT,
                    file_id TEXT,
                    filename TEXT NOT NULL,
                    url TEXT NOT NULL,
                    key TEXT NOT NULL UNIQUE,
                    prompt TEXT,
                    negative_prompt TEXT,
                    seed INTEGER,
                    steps INTEGER,
                    cfg REAL,
                    denoise REAL,
                    width INTEGER,
                    height INTEGER,
                    format_name TEXT,
                    status TEXT DEFAULT 'completed',
                    elapsed_ms INTEGER,
                    origin TEXT DEFAULT 'generation',
                    gallery_saved INTEGER DEFAULT 1,
                    created_at TIMESTAMP,
                    metadata_json TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
                    FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generation_loras (
                    id TEXT PRIMARY KEY,
                    generation_id TEXT NOT NULL,
                    lora_name TEXT NOT NULL,
                    lora_model_id TEXT,
                    lora_version_id TEXT,
                    strength REAL DEFAULT 1.0,
                    FOREIGN KEY(generation_id) REFERENCES generations(id) ON DELETE CASCADE,
                    FOREIGN KEY(lora_model_id) REFERENCES models(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_models_user_id ON models(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_models_visibility ON models(visibility);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_models_published_at ON models(published_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_samples_model_id ON model_samples(model_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_samples_version_id ON model_samples(version_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_files_model_id ON model_files(model_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_files_version_id ON model_files(version_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_generations_prompt_id ON generations(prompt_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_generations_model_id ON generations(model_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_generations_key ON generations(key);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_gen_loras_generation_id ON generation_loras(generation_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_gen_loras_model_id ON generation_loras(lora_model_id);")
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

    # --- Relational Creator Models & Generations operations ----------------

    def upsert_model(self, record: dict[str, Any], user_id: Optional[str] = None) -> dict[str, Any]:
        """Insert or update a creator model definition and its versions, files, and samples."""
        model_id = record["model_id"]
        category = record.get("category")
        if hasattr(category, "value"):
            category = category.value
        category = str(category or "General")

        model_type = record.get("model_type")
        if hasattr(model_type, "value"):
            model_type = model_type.value
        model_type = str(model_type or "Checkpoint")

        visibility = record.get("visibility")
        if hasattr(visibility, "value"):
            visibility = visibility.value
        visibility = str(visibility or "Private")

        title = str(record.get("title") or "Untitled model")
        published_at = record.get("published_at")
        created_at = record.get("created_at") or datetime.now(timezone.utc).isoformat()
        updated_at = record.get("updated_at") or datetime.now(timezone.utc).isoformat()
        raw_json = json.dumps(record, ensure_ascii=False)

        with self.get_connection() as conn:
            # Check user_id: if not provided, see if existing model has a user_id
            effective_user_id = user_id or record.get("user_id")
            if not effective_user_id:
                existing = conn.execute("SELECT user_id FROM models WHERE id = ?", (model_id,)).fetchone()
                if existing:
                    effective_user_id = existing["user_id"]

            # Validate effective_user_id exists in users table (to satisfy FK)
            if effective_user_id:
                u_row = conn.execute("SELECT id FROM users WHERE id = ?", (effective_user_id,)).fetchone()
                if not u_row:
                    effective_user_id = None

            conn.execute("BEGIN IMMEDIATE;")
            conn.execute(
                """
                INSERT INTO models (id, user_id, title, category, model_type, visibility, published_at, created_at, updated_at, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id = COALESCE(excluded.user_id, models.user_id),
                    title = excluded.title,
                    category = excluded.category,
                    model_type = excluded.model_type,
                    visibility = excluded.visibility,
                    published_at = excluded.published_at,
                    updated_at = excluded.updated_at,
                    raw_json = excluded.raw_json
                """,
                (
                    model_id,
                    effective_user_id,
                    title,
                    category,
                    model_type,
                    visibility,
                    published_at,
                    created_at,
                    updated_at,
                    raw_json,
                ),
            )

            # Sync versions: delete existing versions for this model (cascades to files and samples)
            conn.execute("DELETE FROM model_versions WHERE model_id = ?", (model_id,))

            for ver in record.get("versions", []):
                ver_id = ver["version_id"]
                ver_name = ver.get("name", "v1.0")
                ver_created = ver.get("created_at") or created_at
                conn.execute(
                    "INSERT INTO model_versions (id, model_id, name, created_at) VALUES (?, ?, ?, ?)",
                    (ver_id, model_id, ver_name, ver_created),
                )

                for f in ver.get("files", []):
                    f_id = f["file_id"]
                    f_name = f["filename"]
                    f_size = int(f.get("size", 0))
                    f_hash = f.get("sha256")
                    f_prec = f.get("precision")
                    if hasattr(f_prec, "value"):
                        f_prec = f_prec.value
                    f_prec = str(f_prec or "FP16")
                    f_vis = 1 if f.get("visible", True) else 0
                    f_stored = f.get("stored_name")
                    conn.execute(
                        """
                        INSERT INTO model_files (id, model_id, version_id, filename, size, sha256, precision, visible, stored_name)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (f_id, model_id, ver_id, f_name, f_size, f_hash, f_prec, f_vis, f_stored),
                    )

                for s in ver.get("samples", []):
                    s_id = s.get("sample_id") or s.get("id") or uuid.uuid4().hex
                    s_name = s.get("filename", "sample.png")
                    s_kind = s.get("kind", "image")
                    s_stored = s.get("stored_name", "")
                    s_url = s.get("url") or f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/id/{model_id}/versions/{ver_id}/samples/{s_id}/download"
                    s_meta = json.dumps(s.get("metadata", {}), ensure_ascii=False)
                    s_created = s.get("created_at") or created_at
                    conn.execute(
                        """
                        INSERT INTO model_samples (id, model_id, version_id, filename, kind, stored_name, url, metadata, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (s_id, model_id, ver_id, s_name, s_kind, s_stored, s_url, s_meta, s_created),
                    )

            conn.execute("COMMIT;")

        return {
            "model_id": model_id,
            "title": title,
            "category": category,
            "model_type": model_type,
            "visibility": visibility,
        }

    def delete_model(self, model_id: str) -> bool:
        """Delete model by ID with cascade deletion of versions, files, and samples."""
        with self.get_connection() as conn:
            cursor = conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
            return cursor.rowcount > 0

    def upsert_sample(self, model_id: str, version_id: str, sample: dict[str, Any]) -> dict[str, Any]:
        """Insert or update a showcase sample linked to a model version."""
        s_id = sample.get("sample_id") or sample.get("id") or uuid.uuid4().hex
        s_name = sample.get("filename", "sample.png")
        s_kind = sample.get("kind", "image")
        s_stored = sample.get("stored_name", "")
        s_url = sample.get("url") or f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/id/{model_id}/versions/{version_id}/samples/{s_id}/download"
        s_meta = json.dumps(sample.get("metadata", {}), ensure_ascii=False)
        s_created = sample.get("created_at") or datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO model_samples (id, model_id, version_id, filename, kind, stored_name, url, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    filename = excluded.filename,
                    kind = excluded.kind,
                    stored_name = excluded.stored_name,
                    url = excluded.url,
                    metadata = excluded.metadata
                """,
                (s_id, model_id, version_id, s_name, s_kind, s_stored, s_url, s_meta, s_created),
            )
        return {"sample_id": s_id, "model_id": model_id, "version_id": version_id, "url": s_url}

    def delete_sample(self, sample_id: str) -> bool:
        """Delete a sample by ID."""
        with self.get_connection() as conn:
            cursor = conn.execute("DELETE FROM model_samples WHERE id = ?", (sample_id,))
            return cursor.rowcount > 0

    def insert_generation(
        self, gen_dict: dict[str, Any], loras_list: Optional[list[dict[str, Any]]] = None
    ) -> dict[str, Any]:
        """Record an image or asset generation with full relational metadata and LoRAs."""
        gen_id = gen_dict.get("id") or uuid.uuid4().hex
        prompt_id = gen_dict["prompt_id"]
        filename = gen_dict["filename"]
        url = gen_dict["url"]
        key = gen_dict["key"]
        version_id = gen_dict.get("version_id")
        file_id = gen_dict.get("file_id")
        prompt = gen_dict.get("prompt")
        negative_prompt = gen_dict.get("negative_prompt")
        seed = gen_dict.get("seed")
        steps = gen_dict.get("steps")
        cfg = gen_dict.get("cfg")
        denoise = gen_dict.get("denoise")
        width = gen_dict.get("width")
        height = gen_dict.get("height")
        format_name = gen_dict.get("format_name")
        status = gen_dict.get("status", "completed")
        elapsed_ms = gen_dict.get("elapsed_ms")
        origin = gen_dict.get("origin", "generation")
        gallery_saved = 1 if gen_dict.get("gallery_saved", True) else 0
        created_at = gen_dict.get("created_at") or datetime.now(timezone.utc).isoformat()
        metadata_json = gen_dict.get("metadata_json")
        if metadata_json is None and "metadata" in gen_dict:
            metadata_json = json.dumps(gen_dict["metadata"], ensure_ascii=False)

        with self.get_connection() as conn:
            # Validate user_id against users table
            user_id = gen_dict.get("user_id") or None
            if user_id:
                u_row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
                if not u_row:
                    user_id = None

            # Validate model_id against models table
            model_id = gen_dict.get("model_id") or None
            if model_id:
                m_row = conn.execute("SELECT id FROM models WHERE id = ?", (model_id,)).fetchone()
                if not m_row:
                    model_id = None

            conn.execute("BEGIN IMMEDIATE;")
            conn.execute(
                """
                INSERT INTO generations (
                    id, prompt_id, user_id, model_id, version_id, file_id, filename,
                    url, key, prompt, negative_prompt, seed, steps, cfg, denoise,
                    width, height, format_name, status, elapsed_ms, origin,
                    gallery_saved, created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    status = excluded.status,
                    elapsed_ms = excluded.elapsed_ms,
                    metadata_json = excluded.metadata_json
                """,
                (
                    gen_id,
                    prompt_id,
                    user_id,
                    model_id,
                    version_id,
                    file_id,
                    filename,
                    url,
                    key,
                    prompt,
                    negative_prompt,
                    seed,
                    steps,
                    cfg,
                    denoise,
                    width,
                    height,
                    format_name,
                    status,
                    elapsed_ms,
                    origin,
                    gallery_saved,
                    created_at,
                    metadata_json,
                ),
            )

            # Insert LoRAs
            if loras_list:
                for lora in loras_list:
                    lora_id = uuid.uuid4().hex
                    lora_name = lora.get("lora_name") or lora.get("lora") or ""
                    lora_model_id = lora.get("lora_model_id") or lora.get("model_id") or None
                    if lora_model_id:
                        m_row = conn.execute("SELECT id FROM models WHERE id = ?", (lora_model_id,)).fetchone()
                        if not m_row:
                            lora_model_id = None
                    lora_version_id = lora.get("lora_version_id") or lora.get("version_id")
                    strength = float(lora.get("strength", 1.0))
                    conn.execute(
                        """
                        INSERT INTO generation_loras (id, generation_id, lora_name, lora_model_id, lora_version_id, strength)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (lora_id, gen_id, lora_name, lora_model_id, lora_version_id, strength),
                    )

            conn.execute("COMMIT;")

        return {"id": gen_id, "prompt_id": prompt_id, "key": key, "url": url}

    def get_model_generations(
        self, model_id: str, version_id: Optional[str] = None, page: int = 1, limit: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Fetch paginated generations created with a model (as base model or LoRA)."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        with self.get_connection() as conn:
            if version_id:
                count_sql = """
                    SELECT COUNT(DISTINCT g.id) as total
                    FROM generations g
                    WHERE (g.model_id = ? AND g.version_id = ?)
                       OR g.id IN (SELECT generation_id FROM generation_loras WHERE lora_model_id = ? AND lora_version_id = ?)
                """
                count_params = (model_id, version_id, model_id, version_id)
                query_sql = """
                    SELECT g.*, m.title as model_title
                    FROM generations g
                    LEFT JOIN models m ON g.model_id = m.id
                    WHERE (g.model_id = ? AND g.version_id = ?)
                       OR g.id IN (SELECT generation_id FROM generation_loras WHERE lora_model_id = ? AND lora_version_id = ?)
                    ORDER BY g.created_at DESC
                    LIMIT ? OFFSET ?
                """
                query_params = (model_id, version_id, model_id, version_id, limit, offset)
            else:
                count_sql = """
                    SELECT COUNT(DISTINCT g.id) as total
                    FROM generations g
                    WHERE g.model_id = ?
                       OR g.id IN (SELECT generation_id FROM generation_loras WHERE lora_model_id = ?)
                """
                count_params = (model_id, model_id)
                query_sql = """
                    SELECT g.*, m.title as model_title
                    FROM generations g
                    LEFT JOIN models m ON g.model_id = m.id
                    WHERE g.model_id = ?
                       OR g.id IN (SELECT generation_id FROM generation_loras WHERE lora_model_id = ?)
                    ORDER BY g.created_at DESC
                    LIMIT ? OFFSET ?
                """
                query_params = (model_id, model_id, limit, offset)

            total = conn.execute(count_sql, count_params).fetchone()["total"]
            rows = conn.execute(query_sql, query_params).fetchall()

            items: list[dict[str, Any]] = []
            for r in rows:
                item = dict(r)
                raw_meta = item.pop("metadata_json", None)
                try:
                    item["metadata"] = json.loads(raw_meta) if raw_meta else None
                except Exception:
                    item["metadata"] = None
                item["gallery_saved"] = bool(item.get("gallery_saved", 1))

                lora_rows = conn.execute(
                    "SELECT id, lora_name, lora_model_id, lora_version_id, strength FROM generation_loras WHERE generation_id = ?",
                    (item["id"],),
                ).fetchall()
                item["loras"] = [dict(lr) for lr in lora_rows]
                items.append(item)

            return items, total

    def get_model_samples(
        self, model_id: str, version_id: Optional[str] = None, page: int = 1, limit: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Fetch paginated showcase samples contained in a model."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        with self.get_connection() as conn:
            if version_id:
                count_sql = "SELECT COUNT(*) as total FROM model_samples WHERE model_id = ? AND version_id = ?"
                count_params = (model_id, version_id)
                query_sql = "SELECT * FROM model_samples WHERE model_id = ? AND version_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
                query_params = (model_id, version_id, limit, offset)
            else:
                count_sql = "SELECT COUNT(*) as total FROM model_samples WHERE model_id = ?"
                count_params = (model_id,)
                query_sql = "SELECT * FROM model_samples WHERE model_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
                query_params = (model_id, limit, offset)

            total = conn.execute(count_sql, count_params).fetchone()["total"]
            rows = conn.execute(query_sql, query_params).fetchall()

            items: list[dict[str, Any]] = []
            for r in rows:
                raw_meta = r["metadata"]
                try:
                    meta = json.loads(raw_meta) if raw_meta else {}
                except Exception:
                    meta = {}
                items.append(
                    {
                        "sample_id": r["id"],
                        "filename": r["filename"],
                        "url": r["url"],
                        "kind": r["kind"],
                        "metadata": meta,
                        "model_id": r["model_id"],
                        "version_id": r["version_id"],
                        "created_at": r["created_at"],
                    }
                )

            return items, total

    def get_paginated_generations(
        self, user_id: Optional[str] = None, model_id: Optional[str] = None, page: int = 1, limit: int = 20
    ) -> tuple[list[dict[str, Any]], int]:
        """Fetch paginated gallery generations with optional user and model filtering."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit

        where_clauses = ["1=1"]
        params: list[Any] = []

        if user_id:
            where_clauses.append("g.user_id = ?")
            params.append(user_id)

        if model_id:
            where_clauses.append(
                "(g.model_id = ? OR g.id IN (SELECT generation_id FROM generation_loras WHERE lora_model_id = ?))"
            )
            params.extend([model_id, model_id])

        where_stmt = " AND ".join(where_clauses)

        with self.get_connection() as conn:
            count_sql = f"SELECT COUNT(DISTINCT g.id) as total FROM generations g WHERE {where_stmt}"
            total = conn.execute(count_sql, tuple(params)).fetchone()["total"]

            query_sql = f"""
                SELECT g.*, m.title as model_title
                FROM generations g
                LEFT JOIN models m ON g.model_id = m.id
                WHERE {where_stmt}
                ORDER BY g.created_at DESC
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query_sql, tuple(params + [limit, offset])).fetchall()

            items: list[dict[str, Any]] = []
            for r in rows:
                item = dict(r)
                raw_meta = item.pop("metadata_json", None)
                try:
                    item["metadata"] = json.loads(raw_meta) if raw_meta else None
                except Exception:
                    item["metadata"] = None
                item["gallery_saved"] = bool(item.get("gallery_saved", 1))

                lora_rows = conn.execute(
                    "SELECT id, lora_name, lora_model_id, lora_version_id, strength FROM generation_loras WHERE generation_id = ?",
                    (item["id"],),
                ).fetchall()
                item["loras"] = [dict(lr) for lr in lora_rows]
                items.append(item)

            return items, total

    def sync_filesystem_to_db(
        self, models_dir: Optional[Path] = None, storage_dir: Optional[Path] = None
    ) -> dict[str, int]:
        """Index existing definition JSONs and storage sidecars into SQLite."""
        synced_models = 0
        synced_generations = 0

        # 1. Sync models
        if models_dir is None:
            backend_root = Path(__file__).parent.parent.resolve()
            models_dir = (backend_root / "models" / "definitions").resolve()
        if models_dir.is_dir():
            for p in models_dir.glob("*.json"):
                try:
                    content = json.loads(p.read_text(encoding="utf-8"))
                    if isinstance(content, dict) and "model_id" in content:
                        self.upsert_model(content)
                        synced_models += 1
                except Exception as exc:
                    logger.warning("Failed to sync model file %s: %s", p, exc)

        # 2. Sync storage generations
        if storage_dir is None:
            storage_dir = Path(self.settings.STORAGE_DIR).resolve()
        if storage_dir.is_dir():
            with self.get_connection() as conn:
                existing_keys = {
                    r["key"] for r in conn.execute("SELECT key FROM generations").fetchall()
                }

            for sidecar in storage_dir.rglob("*.json"):
                try:
                    if "definitions" in sidecar.parts:
                        continue
                    meta = json.loads(sidecar.read_text(encoding="utf-8"))
                    if not isinstance(meta, dict) or "prompt_id" not in meta:
                        continue
                    media_path = sidecar.with_suffix("")
                    if not media_path.is_file():
                        continue
                    rel_key = media_path.relative_to(storage_dir).as_posix()
                    if rel_key in existing_keys:
                        continue

                    prompt_id = meta.get("prompt_id") or "legacy"
                    url = f"{self.settings.FILES_PUBLIC_BASE}/files/{rel_key}"
                    user_id = meta.get("user_id")
                    model_id = meta.get("model_id")
                    version_id = meta.get("version_id")
                    file_id = meta.get("file_id")
                    loras = meta.get("loras") or []

                    gen_dict = {
                        "prompt_id": prompt_id,
                        "user_id": user_id,
                        "model_id": model_id,
                        "version_id": version_id,
                        "file_id": file_id,
                        "filename": media_path.name,
                        "url": url,
                        "key": rel_key,
                        "prompt": meta.get("prompt"),
                        "negative_prompt": meta.get("negative_prompt"),
                        "seed": meta.get("seed"),
                        "steps": meta.get("steps"),
                        "cfg": meta.get("cfg"),
                        "denoise": meta.get("denoise"),
                        "width": meta.get("width"),
                        "height": meta.get("height"),
                        "format_name": meta.get("format_name"),
                        "status": "completed",
                        "elapsed_ms": meta.get("elapsed_ms"),
                        "origin": meta.get("origin", "generation"),
                        "gallery_saved": 1 if meta.get("gallery_saved", True) else 0,
                        "created_at": meta.get("created_at") or datetime.fromtimestamp(media_path.stat().st_mtime, tz=timezone.utc).isoformat(),
                        "metadata_json": json.dumps(meta, ensure_ascii=False),
                    }
                    loras_list = [
                        {
                            "lora_name": item.get("lora") or item.get("lora_name", ""),
                            "lora_model_id": item.get("model_id") or item.get("lora_model_id"),
                            "lora_version_id": item.get("version_id") or item.get("lora_version_id"),
                            "strength": float(item.get("strength", 1.0)),
                        }
                        for item in loras
                        if isinstance(item, dict)
                    ]
                    self.insert_generation(gen_dict, loras_list=loras_list)
                    existing_keys.add(rel_key)
                    synced_generations += 1
                except Exception as exc:
                    logger.warning("Failed to sync storage asset %s: %s", sidecar, exc)

        logger.info(
            "Completed filesystem to SQLite sync: %d models, %d generations",
            synced_models,
            synced_generations,
        )
        return {"synced_models": synced_models, "synced_generations": synced_generations}


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
