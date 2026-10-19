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


class PostgresConnectionWrapper:
    """Wraps a psycopg Connection to provide a sqlite3-compatible execute API."""

    def __init__(self, pg_conn: Any) -> None:
        self.conn = pg_conn

    def execute(self, sql: str, params: tuple | list = ()) -> Any:
        clean_sql = sql.strip()
        if clean_sql.upper().startswith("BEGIN IMMEDIATE"):
            sql = "BEGIN;"
        pg_sql = sql.replace("?", "%s")
        cursor = self.conn.cursor()
        cursor.execute(pg_sql, params)
        return cursor

    def commit(self) -> None:
        if not getattr(self.conn, "autocommit", False):
            self.conn.commit()

    def rollback(self) -> None:
        if not getattr(self.conn, "autocommit", False):
            self.conn.rollback()

    def close(self) -> None:
        self.conn.close()


class Database:
    """Unified Database manager for SoloTensor local SQLite and cloud PostgreSQL storage."""

    def __init__(self, db_path: Optional[str | Path] = None, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.explicit_db_path = db_path is not None
        raw_path = db_path or self.settings.DB_PATH
        path = Path(raw_path)
        if not path.is_absolute():
            backend_root = Path(__file__).parent.parent.resolve()
            path = (backend_root / path).resolve()
        self.db_path = path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def is_postgres(self) -> bool:
        if self.explicit_db_path:
            return False
        db_url = getattr(self.settings, "effective_database_url", self.settings.DATABASE_URL)
        return bool(
            db_url
            and (
                db_url.startswith("postgres://")
                or db_url.startswith("postgresql://")
            )
        )

    @contextmanager
    def get_connection(self) -> Generator[Any, None, None]:
        """Provide a connection configured with Row/dict factory and autocommit."""
        if self.is_postgres:
            try:
                import psycopg
                from psycopg.rows import dict_row

                conn_url = getattr(self.settings, "effective_database_url", self.settings.DATABASE_URL)
                pg_conn = psycopg.connect(conn_url, row_factory=dict_row, autocommit=True, connect_timeout=4)
                wrapped = PostgresConnectionWrapper(pg_conn)
                try:
                    yield wrapped
                finally:
                    wrapped.close()
                return
            except Exception as exc:
                logger.warning(
                    "PostgreSQL connection failed (%s). Falling back to local SQLite (%s).",
                    exc,
                    self.db_path,
                )

        conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=30.0,
            isolation_level=None,
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
                    avatar_url TEXT,
                    bio TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            is_pg = isinstance(conn, PostgresConnectionWrapper)
            if is_pg:
                conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified INTEGER DEFAULT 0;")
                conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;")
                conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;")
            else:
                cursor = conn.execute("PRAGMA table_info(users);")
                cols = [r["name"] for r in cursor.fetchall()]
                if "is_verified" not in cols:
                    conn.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;")
                if "avatar_url" not in cols:
                    conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT;")
                if "bio" not in cols:
                    conn.execute("ALTER TABLE users ADD COLUMN bio TEXT;")

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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_followers (
                    follower_id TEXT NOT NULL,
                    following_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (follower_id, following_id),
                    FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(following_id) REFERENCES users(id) ON DELETE CASCADE
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
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_followers_follower ON user_followers(follower_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_followers_following ON user_followers(following_id);")

            # --- Creator models & generations relational schema -----------------
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS models (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    model_type TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    visibility TEXT DEFAULT 'Private',
                    published_at TIMESTAMP,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    raw_json TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
                );
                """
            )
            if is_pg:
                conn.execute("ALTER TABLE models ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';")
            else:
                cursor = conn.execute("PRAGMA table_info(models);")
                model_cols = [r["name"] for r in cursor.fetchall()]
                if "description" not in model_cols:
                    conn.execute("ALTER TABLE models ADD COLUMN description TEXT DEFAULT '';")

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
                    size BIGINT NOT NULL,
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
                    seed BIGINT,
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

            # --- RBAC & Content Moderation Relational Schema ---------------------
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS roles (
                    name TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    description TEXT,
                    tier_level INTEGER NOT NULL DEFAULT 1,
                    badge_style TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS permissions (
                    codename TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    description TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_name TEXT NOT NULL,
                    permission_codename TEXT NOT NULL,
                    PRIMARY KEY (role_name, permission_codename),
                    FOREIGN KEY(role_name) REFERENCES roles(name) ON DELETE CASCADE,
                    FOREIGN KEY(permission_codename) REFERENCES permissions(codename) ON DELETE CASCADE
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_roles (
                    user_id TEXT NOT NULL,
                    role_name TEXT NOT NULL,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    granted_by TEXT,
                    expires_at TIMESTAMP,
                    PRIMARY KEY (user_id, role_name),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(role_name) REFERENCES roles(name) ON DELETE CASCADE,
                    FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS security_audit_logs (
                    id TEXT PRIMARY KEY,
                    actor_id TEXT,
                    action TEXT NOT NULL,
                    resource_type TEXT NOT NULL,
                    resource_id TEXT NOT NULL,
                    details TEXT DEFAULT '{}',
                    ip_address TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS content_flags (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    target_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    resolution_notes TEXT,
                    resolved_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
                    FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_roles_role_name ON user_roles(role_name);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_name);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_codename);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON security_audit_logs(actor_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON security_audit_logs(action);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON security_audit_logs(resource_type, resource_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_content_flags_status ON content_flags(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_content_flags_target ON content_flags(target_type, target_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_content_flags_user ON content_flags(user_id);")

            # Check if roles and permissions are already seeded
            roles_count_row = conn.execute("SELECT COUNT(*) as count FROM roles;").fetchone()
            already_seeded = bool(roles_count_row and roles_count_row["count"] >= 6)

            if not already_seeded:
                # Seed Baseline Roles
                baseline_roles = [
                    (
                        "guest",
                        "Guest",
                        "Anonymous guest visitor",
                        0,
                        json.dumps({"label": "GUEST", "color": "gray", "className": "border border-[#282c28] bg-[#121412] text-[#8a8e87]"}),
                    ),
                    (
                        "creator",
                        "Creator",
                        "Standard registered creator",
                        1,
                        json.dumps({"label": "CREATOR", "color": "bronze", "className": "border border-[#383d38] bg-[#181b18] text-[#8a8e87]"}),
                    ),
                    (
                        "pro_creator",
                        "Pro Creator",
                        "Subscribed VIP creator with fast lane priority",
                        2,
                        json.dumps({"label": "⚡ PRO", "color": "lime", "className": "border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"}),
                    ),
                    (
                        "verified_creator",
                        "Verified Creator",
                        "Verified model author and partner",
                        3,
                        json.dumps({"label": "★ VERIFIED AUTHOR", "color": "gold", "className": "border border-[#664d1a] bg-[#3b2d12] text-[#f5c66e]"}),
                    ),
                    (
                        "moderator",
                        "Moderator",
                        "Community moderator with review and takedown privileges",
                        4,
                        json.dumps({"label": "🛡 MODERATOR", "color": "cyan", "className": "border border-[#0c4a6e] bg-[#082f49] text-[#38bdf8]"}),
                    ),
                    (
                        "admin",
                        "System Admin",
                        "Full system access and registry control",
                        5,
                        json.dumps({"label": "⚙ ADMIN", "color": "crimson", "className": "border border-[#881337] bg-[#4c0519] text-[#fb7185]"}),
                    ),
                    (
                        "agent:dispatcher",
                        "ComfyUI Dispatcher Service",
                        "Service account for ComfyUI execution and job dispatch",
                        1,
                        json.dumps({"label": "DISPATCHER", "color": "purple"}),
                    ),
                    (
                        "agent:safety_scanner",
                        "Safety Scanner Service",
                        "Service account for automated safety and content filtering",
                        1,
                        json.dumps({"label": "SAFETY", "color": "indigo"}),
                    ),
                    (
                        "agent:model_sync",
                        "Model Sync Service",
                        "Service account for filesystem weights synchronization",
                        1,
                        json.dumps({"label": "SYNC", "color": "blue"}),
                    ),
                ]
                for r_name, r_dname, r_desc, r_tier, r_badge in baseline_roles:
                    conn.execute(
                        """
                        INSERT INTO roles (name, display_name, description, tier_level, badge_style)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(name) DO UPDATE SET
                            display_name = excluded.display_name,
                            description = excluded.description,
                            tier_level = excluded.tier_level,
                            badge_style = excluded.badge_style
                        """,
                        (r_name, r_dname, r_desc, r_tier, r_badge),
                    )

                # Seed Baseline Permissions
                baseline_permissions = [
                    # Generations & Canvas
                    ("generation:create_standard", "generation", "Standard inference (up to 1024x1024, 30 steps)"),
                    ("generation:create_pro", "generation", "High-res, 2K/4K latent upscale, extended steps"),
                    ("generation:create_private", "generation", "Mark generation private (omit from community feeds)"),
                    ("generation:batch_multirun", "generation", "Run batch sizes > 1 (e.g. 4x concurrent synthesis)"),
                    ("generation:delete_own", "generation", "Delete owned outputs from disk and database"),
                    ("generation:delete_any", "generation", "Moderator override to delete violating generations"),
                    ("generation:complete_any", "generation", "Service account generation completion permission"),

                    # Models
                    ("model:publish", "model", "Upload checkpoints, LoRAs, and sidecar recipes"),
                    ("model:download_weights", "model", "Download model safetensors weights files"),
                    ("model:edit_own", "model", "Update title, preview covers, tags of owned models"),
                    ("model:edit_any", "model", "Moderator update of categories or tags"),
                    ("model:delete_own", "model", "Soft delete / unpublish owned model"),
                    ("model:delete_any", "model", "Moderator takedown of violating model"),

                    # AI Tools
                    ("tool:execute", "tool", "Run visual pipelines"),
                    ("tool:publish", "tool", "Export workflow graphs as interactive Studio Tools"),
                    ("tool:delete_own", "tool", "Remove personal tools"),
                    ("tool:delete_any", "tool", "Moderate catalog tools"),

                    # Credits & Monetization
                    ("credits:claim_daily", "credits", "Claim standard daily credit allowance"),
                    ("credits:transfer", "credits", "Tip creators for models or workflow recipes"),
                    ("credits:manage_billing", "credits", "Manage Pro subscriptions and invoices"),
                    ("credits:grant_manual", "credits", "Admin credit injection / refund"),

                    # Moderation & Governance
                    ("moderation:flag_content", "moderation", "Submit user reports on violating assets/models"),
                    ("moderation:review_queue", "moderation", "Access moderation dashboard and report queue"),
                    ("moderation:ban_user", "moderation", "Suspend or shadowban user accounts"),
                    ("moderation:inspect_telemetry", "moderation", "View inference prompts, IP address, and node logs"),

                    # System & Backend Agents
                    ("agent:dispatch_jobs", "agent", "Service account permission to pull jobs for ComfyUI"),
                    ("agent:sync_models", "agent", "Service account permission to scan filesystem weights"),
                    ("agent:audit_safety", "agent", "Automated NSFW/safety scanner callback"),
                ]
                for p_code, p_cat, p_desc in baseline_permissions:
                    conn.execute(
                        """
                        INSERT INTO permissions (codename, category, description)
                        VALUES (?, ?, ?)
                        ON CONFLICT(codename) DO UPDATE SET
                            category = excluded.category,
                            description = excluded.description
                        """,
                        (p_code, p_cat, p_desc),
                    )

                # Role-Permission Mapping
                creator_perms = [
                    "generation:create_standard",
                    "generation:delete_own",
                    "model:publish",
                    "model:download_weights",
                    "model:edit_own",
                    "model:delete_own",
                    "tool:execute",
                    "tool:publish",
                    "tool:delete_own",
                    "credits:claim_daily",
                    "credits:transfer",
                    "moderation:flag_content",
                ]
                pro_perms = creator_perms + [
                    "generation:create_pro",
                    "generation:create_private",
                    "generation:batch_multirun",
                    "credits:manage_billing",
                ]
                verified_perms = pro_perms
                moderator_perms = creator_perms + [
                    "generation:delete_any",
                    "model:edit_any",
                    "model:delete_any",
                    "tool:delete_any",
                    "moderation:review_queue",
                    "moderation:ban_user",
                    "moderation:inspect_telemetry",
                ]
                all_perm_codes = [p[0] for p in baseline_permissions]

                role_perms_map = {
                    "guest": [],
                    "creator": creator_perms,
                    "pro_creator": pro_perms,
                    "verified_creator": verified_perms,
                    "moderator": moderator_perms,
                    "admin": all_perm_codes,
                    "agent:dispatcher": ["agent:dispatch_jobs", "generation:complete_any"],
                    "agent:safety_scanner": ["agent:audit_safety", "moderation:flag_content"],
                    "agent:model_sync": ["agent:sync_models", "model:publish"],
                }
                for role_key, perm_list in role_perms_map.items():
                    for perm_key in perm_list:
                        conn.execute(
                            """
                            INSERT INTO role_permissions (role_name, permission_codename)
                            VALUES (?, ?)
                            ON CONFLICT(role_name, permission_codename) DO NOTHING
                            """,
                            (role_key, perm_key),
                        )

            # Assign user winnguyen282 both admin and verified_creator roles
            u_win = conn.execute(
                "SELECT id FROM users WHERE id = ? OR lower(username) = lower(?)",
                ("d08abc9c-53af-4576-8074-5da4de0d0723", "winnguyen282"),
            ).fetchone()
            if u_win:
                win_uid = u_win["id"]
                now_str = datetime.now(timezone.utc).isoformat()
                for r_win in ("admin", "verified_creator"):
                    conn.execute(
                        """
                        INSERT INTO user_roles (user_id, role_name, granted_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(user_id, role_name) DO NOTHING
                        """,
                        (win_uid, r_win, now_str),
                    )
                conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (win_uid,))

            # Backfill any existing users without user_roles
            conn.execute(
                """
                INSERT INTO user_roles (user_id, role_name, granted_at)
                SELECT id, COALESCE(role, 'creator'), created_at
                FROM users
                WHERE id NOT IN (SELECT user_id FROM user_roles)
                ON CONFLICT(user_id, role_name) DO NOTHING
                """
            )

            if is_pg:
                logger.info("Initialized SoloTensor PostgreSQL schema from DATABASE_URL")
            else:
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
        avatar_url: Optional[str] = None,
        bio: Optional[str] = None,
    ) -> dict[str, Any]:
        ts = created_at or datetime.now(timezone.utc).isoformat()
        assigned_role = role or "creator"
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, email.lower(), username, display_name, hashed_password, assigned_role, int(is_verified), avatar_url, bio, ts),
            )
            # Default new registered user to creator role in user_roles
            conn.execute(
                """
                INSERT INTO user_roles (user_id, role_name, granted_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, role_name) DO NOTHING
                """,
                (user_id, assigned_role, ts),
            )
            # Check if this user is winnguyen282, assign admin + verified_creator
            if user_id == "d08abc9c-53af-4576-8074-5da4de0d0723" or username.lower() == "winnguyen282":
                for special_role in ("admin", "verified_creator"):
                    conn.execute(
                        """
                        INSERT INTO user_roles (user_id, role_name, granted_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(user_id, role_name) DO NOTHING
                        """,
                        (user_id, special_role, ts),
                    )
                conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (user_id,))
                assigned_role = "admin"

        return {
            "id": user_id,
            "email": email.lower(),
            "username": username,
            "display_name": display_name,
            "role": assigned_role,
            "is_verified": bool(is_verified),
            "avatar_url": avatar_url,
            "bio": bio,
            "created_at": ts,
        }

    def _clean_user_row(self, row: Any) -> Optional[dict[str, Any]]:
        if not row:
            return None
        data = dict(row)
        data["is_verified"] = bool(data.get("is_verified", 0))
        if isinstance(data.get("created_at"), datetime):
            data["created_at"] = data["created_at"].isoformat()
        return data

    def get_user_by_id(self, user_id: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at FROM users WHERE id = ?",
                (user_id,),
            )
            return self._clean_user_row(cursor.fetchone())

    def get_user_by_email(self, email: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at FROM users WHERE lower(email) = lower(?)",
                (email,),
            )
            return self._clean_user_row(cursor.fetchone())

    def get_user_by_username(self, username: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at FROM users WHERE lower(username) = lower(?)",
                (username,),
            )
            return self._clean_user_row(cursor.fetchone())

    def get_user_by_email_or_username(self, identifier: str) -> Optional[dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at
                FROM users
                WHERE lower(email) = lower(?) OR lower(username) = lower(?)
                """,
                (identifier, identifier),
            )
            return self._clean_user_row(cursor.fetchone())

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

    def update_user_profile(
        self,
        user_id: str,
        display_name: Optional[str] = None,
        avatar_url: Optional[str] = None,
        bio: Optional[str] = None,
    ) -> bool:
        """Update display_name, avatar_url, or bio for a user."""
        updates: list[str] = []
        params: list[Any] = []
        if display_name is not None:
            updates.append("display_name = ?")
            params.append(display_name)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(avatar_url)
        if bio is not None:
            updates.append("bio = ?")
            params.append(bio)
        if not updates:
            return False
        params.append(user_id)
        with self.get_connection() as conn:
            cursor = conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
            return cursor.rowcount > 0

    # --- User Social & Followers --------------------------------------------

    def toggle_follow_user(self, follower_id: str, following_id: str) -> bool:
        """Toggle follow state between follower and target user.

        If record exists in user_followers, deletes it and returns False (unfollowed).
        Else, inserts it and returns True (followed).
        """
        with self.get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE;")
            row = conn.execute(
                "SELECT 1 FROM user_followers WHERE follower_id = ? AND following_id = ?",
                (follower_id, following_id),
            ).fetchone()
            if row:
                conn.execute(
                    "DELETE FROM user_followers WHERE follower_id = ? AND following_id = ?",
                    (follower_id, following_id),
                )
                conn.execute("COMMIT;")
                return False
            else:
                conn.execute(
                    "INSERT INTO user_followers (follower_id, following_id, created_at) VALUES (?, ?, ?)",
                    (follower_id, following_id, datetime.now(timezone.utc).isoformat()),
                )
                conn.execute("COMMIT;")
                return True

    def is_following(self, follower_id: str, following_id: str) -> bool:
        """Return True if follower_id is following following_id, False otherwise."""
        if not follower_id or not following_id:
            return False
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM user_followers WHERE follower_id = ? AND following_id = ?",
                (follower_id, following_id),
            ).fetchone()
            return row is not None

    def get_followers_count(self, user_id: str) -> int:
        """Get total number of followers for a user."""
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM user_followers WHERE following_id = ?",
                (user_id,),
            ).fetchone()
            return row["cnt"] if row else 0

    def get_following_count(self, user_id: str) -> int:
        """Get total number of users followed by a user."""
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM user_followers WHERE follower_id = ?",
                (user_id,),
            ).fetchone()
            return row["cnt"] if row else 0

    def get_user_public_profile(
        self, username_or_id: str, viewer_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """Fetch public profile and aggregate statistics for a creator by username or id."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, email, username, display_name, role, is_verified, avatar_url, bio, created_at
                FROM users
                WHERE lower(username) = lower(?) OR id = ?
                """,
                (username_or_id, username_or_id),
            )
            row = cursor.fetchone()
            if not row:
                return None
            user_data = dict(row)
            user_id = user_data["id"]
            username = user_data["username"]

            # Aggregate statistics
            models_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM models WHERE user_id = ? AND (visibility = 'Public' OR lower(visibility) = 'public')",
                (user_id,),
            ).fetchone()
            models_count = models_row["cnt"] if models_row else 0

            posts_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM generations WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            posts_count = posts_row["cnt"] if posts_row else 0

            followers_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM user_followers WHERE following_id = ?",
                (user_id,),
            ).fetchone()
            followers_count = followers_row["cnt"] if followers_row else 0

            following_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM user_followers WHERE follower_id = ?",
                (user_id,),
            ).fetchone()
            following_count = following_row["cnt"] if following_row else 0

        # Tools count: scan tools definitions authored by this user
        tools_count = 0
        try:
            tools_dir = Path(self.settings.TOOLS_DIR)
            if not tools_dir.is_absolute():
                backend_root = Path(__file__).parent.parent.resolve()
                tools_dir = (backend_root / tools_dir).resolve()
            definitions_dir = tools_dir / "definitions"
            if definitions_dir.is_dir():
                for p in definitions_dir.glob("*.json"):
                    try:
                        tool_data = json.loads(p.read_text(encoding="utf-8"))
                        if isinstance(tool_data, dict):
                            t_user = tool_data.get("user_id")
                            t_author = tool_data.get("author_username")
                            if (t_user and t_user == user_id) or (t_author and t_author.lower() == username.lower()):
                                tools_count += 1
                    except Exception:
                        continue
        except Exception:
            tools_count = 0

        is_following_val = False
        if viewer_id:
            is_following_val = self.is_following(viewer_id, user_id)

        roles = self.get_user_roles(user_id)
        primary_role = roles[0] if roles else (user_data.get("role") or "creator")
        permissions = list(self.get_user_permissions(user_id))

        return {
            "id": user_id,
            "username": username,
            "display_name": user_data.get("display_name") or username,
            "avatar_url": user_data.get("avatar_url"),
            "role": user_data.get("role") or "creator",
            "bio": user_data.get("bio"),
            "created_at": str(user_data["created_at"]),
            "is_following": is_following_val,
            "followers_count": followers_count,
            "following_count": following_count,
            "runs_count": posts_count,
            "downloads_count": 0,
            "likes_count": 0,
            "stars_count": 0,
            "tools_count": tools_count,
            "models_count": models_count,
            "posts_count": posts_count,
            "workflows_count": tools_count,
            "roles": roles,
            "primary_role": primary_role,
            "permissions": permissions,
        }

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
        """Look up an unused auth token by token string or 6-digit OTP code and type."""
        clean = token.strip()
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, user_id, token, token_type, otp_code, expires_at, used_at, created_at
                FROM auth_tokens
                WHERE (token = ? OR otp_code = ?) AND token_type = ? AND used_at IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (clean, clean, token_type),
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
            if not row:
                return None
            data = dict(row)
            if isinstance(data.get("last_claimed_at"), datetime):
                data["last_claimed_at"] = data["last_claimed_at"].isoformat()
            if isinstance(data.get("updated_at"), datetime):
                data["updated_at"] = data["updated_at"].isoformat()
            return data

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
        description = str(record.get("description") or "")
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
                INSERT INTO models (id, user_id, title, category, model_type, description, visibility, published_at, created_at, updated_at, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id = COALESCE(excluded.user_id, models.user_id),
                    title = excluded.title,
                    category = excluded.category,
                    model_type = excluded.model_type,
                    description = excluded.description,
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
                    description,
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
                if isinstance(item.get("created_at"), datetime):
                    item["created_at"] = item["created_at"].isoformat()
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
                if isinstance(item.get("created_at"), datetime):
                    item["created_at"] = item["created_at"].isoformat()
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

    # --- Role-Based Access Control (RBAC) Operations ------------------------

    def get_user_roles(self, user_id: str) -> list[str]:
        """Fetch all active roles assigned to a user, sorted by highest tier level."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT ur.role_name
                FROM user_roles ur
                LEFT JOIN roles r ON ur.role_name = r.name
                WHERE ur.user_id = ? AND (ur.expires_at IS NULL OR ur.expires_at > ?)
                ORDER BY COALESCE(r.tier_level, 0) DESC, ur.granted_at ASC
                """,
                (user_id, now),
            )
            roles = [r["role_name"] for r in cursor.fetchall()]
            if not roles:
                u_row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
                if u_row and u_row["role"]:
                    roles = [u_row["role"]]
                else:
                    roles = ["creator"]
            return roles

    def get_user_permissions(self, user_id: str) -> set[str]:
        """Fetch unique permissions for all active roles of a user."""
        roles = self.get_user_roles(user_id)
        with self.get_connection() as conn:
            if "admin" in roles:
                cursor = conn.execute("SELECT codename FROM permissions")
                return {r["codename"] for r in cursor.fetchall()}
            if not roles:
                return set()
            placeholders = ",".join("?" for _ in roles)
            cursor = conn.execute(
                f"SELECT DISTINCT permission_codename FROM role_permissions WHERE role_name IN ({placeholders})",
                tuple(roles),
            )
            return {r["permission_codename"] for r in cursor.fetchall()}

    def assign_user_role(
        self,
        user_id: str,
        role_name: str,
        granted_by: Optional[str] = None,
        expires_at: Optional[str] = None,
    ) -> bool:
        """Assign or renew a role for a user."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            # Validate granted_by exists in users table (to satisfy FK)
            if granted_by:
                g_row = conn.execute("SELECT id FROM users WHERE id = ?", (granted_by,)).fetchone()
                if not g_row:
                    granted_by = None

            conn.execute(
                """
                INSERT INTO user_roles (user_id, role_name, granted_at, granted_by, expires_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, role_name) DO UPDATE SET
                    granted_at = excluded.granted_at,
                    granted_by = excluded.granted_by,
                    expires_at = excluded.expires_at
                """,
                (user_id, role_name, now, granted_by, expires_at),
            )
            # Synchronize primary role in users table if new role tier is higher
            r_row = conn.execute("SELECT tier_level FROM roles WHERE name = ?", (role_name,)).fetchone()
            if r_row:
                new_tier = r_row["tier_level"]
                u_row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
                if u_row:
                    cur_role = u_row["role"]
                    cur_tier_row = conn.execute("SELECT tier_level FROM roles WHERE name = ?", (cur_role,)).fetchone()
                    cur_tier = cur_tier_row["tier_level"] if cur_tier_row else 0
                    if new_tier >= cur_tier:
                        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role_name, user_id))
            return True

    def revoke_user_role(self, user_id: str, role_name: str) -> bool:
        """Revoke a role from a user."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM user_roles WHERE user_id = ? AND role_name = ?",
                (user_id, role_name),
            )
            deleted = cursor.rowcount > 0
            if deleted:
                # Recompute primary role and update users table
                remaining = self.get_user_roles(user_id)
                new_primary = remaining[0] if remaining else "creator"
                conn.execute("UPDATE users SET role = ? WHERE id = ?", (new_primary, user_id))
            return deleted

    def insert_audit_log(
        self,
        actor_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: str,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> dict[str, Any]:
        """Record an entry in security_audit_logs."""
        log_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        details_json = json.dumps(details or {}, ensure_ascii=False)
        with self.get_connection() as conn:
            effective_actor = actor_id
            if effective_actor:
                a_row = conn.execute("SELECT id FROM users WHERE id = ?", (effective_actor,)).fetchone()
                if not a_row:
                    effective_actor = None

            conn.execute(
                """
                INSERT INTO security_audit_logs (id, actor_id, action, resource_type, resource_id, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (log_id, effective_actor, action, resource_type, resource_id, details_json, ip_address, now),
            )
        return {
            "id": log_id,
            "actor_id": actor_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details or {},
            "ip_address": ip_address,
            "created_at": now,
        }

    # --- Content Moderation & Reporting Operations --------------------------

    def create_content_flag(
        self,
        target_type: str,
        target_id: str,
        reason: str,
        user_id: Optional[str] = None,
        flag_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Submit a new content flag / user report."""
        f_id = flag_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            effective_user = user_id
            if effective_user:
                u_row = conn.execute("SELECT id FROM users WHERE id = ?", (effective_user,)).fetchone()
                if not u_row:
                    effective_user = None

            conn.execute(
                """
                INSERT INTO content_flags (id, user_id, target_type, target_id, reason, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?)
                """,
                (f_id, effective_user, target_type, target_id, reason, now),
            )
        return {
            "id": f_id,
            "user_id": user_id,
            "target_type": target_type,
            "target_id": target_id,
            "reason": reason,
            "status": "pending",
            "resolution_notes": None,
            "resolved_by": None,
            "created_at": now,
            "resolved_at": None,
        }

    def get_content_flags(
        self,
        status: Optional[str] = None,
        target_type: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """Fetch paginated content flags with optional status and target_type filtering."""
        page = max(1, page)
        limit = max(1, min(limit, 100))
        offset = (page - 1) * limit
        where_clauses = ["1=1"]
        params: list[Any] = []
        if status:
            where_clauses.append("status = ?")
            params.append(status)
        if target_type:
            where_clauses.append("target_type = ?")
            params.append(target_type)
        where_sql = " AND ".join(where_clauses)

        with self.get_connection() as conn:
            count_cursor = conn.execute(f"SELECT COUNT(*) as total FROM content_flags WHERE {where_sql}", tuple(params))
            total = count_cursor.fetchone()["total"]

            query_sql = f"""
                SELECT id, user_id, target_type, target_id, reason, status, resolution_notes, resolved_by, created_at, resolved_at
                FROM content_flags
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query_sql, tuple(params + [limit, offset])).fetchall()
            items: list[dict[str, Any]] = []
            for r in rows:
                data = dict(r)
                if isinstance(data.get("created_at"), datetime):
                    data["created_at"] = data["created_at"].isoformat()
                if isinstance(data.get("resolved_at"), datetime):
                    data["resolved_at"] = data["resolved_at"].isoformat()
                items.append(data)
            return items, total

    def get_content_flag_by_id(self, flag_id: str) -> Optional[dict[str, Any]]:
        """Fetch single content flag by ID."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT id, user_id, target_type, target_id, reason, status, resolution_notes, resolved_by, created_at, resolved_at
                FROM content_flags WHERE id = ?
                """,
                (flag_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            if isinstance(data.get("created_at"), datetime):
                data["created_at"] = data["created_at"].isoformat()
            if isinstance(data.get("resolved_at"), datetime):
                data["resolved_at"] = data["resolved_at"].isoformat()
            return data

    def resolve_content_flag(
        self,
        flag_id: str,
        status: str,
        resolved_by: Optional[str] = None,
        resolution_notes: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Resolve or dismiss a moderation content flag."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            effective_resolver = resolved_by
            if effective_resolver:
                r_row = conn.execute("SELECT id FROM users WHERE id = ?", (effective_resolver,)).fetchone()
                if not r_row:
                    effective_resolver = None

            cursor = conn.execute(
                """
                UPDATE content_flags
                SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = ?
                WHERE id = ?
                """,
                (status, resolution_notes, effective_resolver, now, flag_id),
            )
            if cursor.rowcount == 0:
                return None
        return self.get_content_flag_by_id(flag_id)


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
