"""SoloTensor Seed Script: Create Demo Users across All RBAC Roles.

Creates users for each role tier (guest, creator, pro_creator, verified_creator, moderator, admin)
with hashed passwords, avatars, bios, verified status, role assignments, and initial credit allocations.
Safe to re-run (idempotent).
"""

from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import secrets
import sys
import uuid

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Ensure stdout handles unicode properly on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from app.db import Database, get_db
from app.services.auth_service import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_demo_users")

DEFAULT_PASSWORD = "Password123!"

DEMO_USERS = [
    {
        "username": "cyber_artisan",
        "email": "cyber.artisan@solotensor.ai",
        "display_name": "Cyber Artisan",
        "primary_role": "creator",
        "roles": ["creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=cyber_artisan",
        "bio": "Prompt engineer & latent explorer crafting cyberpunk visual aesthetics.",
        "balance": 100,
        "daily_allowance": 100,
        "api_key_name": "artisan-default-key",
    },
    {
        "username": "pixel_poet",
        "email": "pixel.poet@solotensor.ai",
        "display_name": "Pixel Poet",
        "primary_role": "creator",
        "roles": ["creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=pixel_poet",
        "bio": "Digital illustrator & fantasy concept artist generating ethereal landscapes.",
        "balance": 100,
        "daily_allowance": 100,
        "api_key_name": "poet-render-key",
    },
    {
        "username": "neon_architect",
        "email": "neon.architect@solotensor.ai",
        "display_name": "Neon Architect ⚡",
        "primary_role": "pro_creator",
        "roles": ["pro_creator", "creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=neon_architect",
        "bio": "⚡ VIP Pro subscriber. Focused on 2K/4K latent upscaling and private compute lanes.",
        "balance": 500,
        "daily_allowance": 500,
        "api_key_name": "pro-priority-key",
    },
    {
        "username": "lora_mastermind",
        "email": "lora.mastermind@solotensor.ai",
        "display_name": "Mastermind LoRA ★",
        "primary_role": "verified_creator",
        "roles": ["verified_creator", "creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=lora_mastermind",
        "bio": "★ Official partner model author. Creator of hyper-realistic portrait & lighting LoRAs.",
        "balance": 1000,
        "daily_allowance": 1000,
        "api_key_name": "verified-partner-key",
    },
    {
        "username": "sentinel_mod",
        "email": "sentinel.mod@solotensor.ai",
        "display_name": "Sentinel Moderator 🛡️",
        "primary_role": "moderator",
        "roles": ["moderator", "creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=sentinel_mod",
        "bio": "🛡 Solo Studio trust & safety officer. Reviewing darkroom queue and keeping the platform safe.",
        "balance": 300,
        "daily_allowance": 300,
        "api_key_name": "moderator-telemetry-key",
    },
    {
        "username": "solotensor_admin",
        "email": "solotensor.admin@solotensor.ai",
        "display_name": "Solo Studio Admin ⚙️",
        "primary_role": "admin",
        "roles": ["admin", "verified_creator"],
        "is_verified": 1,
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=solotensor_admin",
        "bio": "⚙ Solo Studio system administrator with full registry controls and governance.",
        "balance": 9999,
        "daily_allowance": 9999,
        "api_key_name": "admin-root-key",
    },
]


def seed_demo_users():
    db: Database = get_db()
    hashed_pwd = hash_password(DEFAULT_PASSWORD)
    now_iso = datetime.now(timezone.utc).isoformat()

    created_users = []

    with db.get_connection() as conn:
        # Guests are unauthenticated/anonymous by definition (current_user is None).
        # Remove any placeholder guest records from users table.
        conn.execute("DELETE FROM users WHERE username = 'guest_wanderer' OR role = 'guest';")

        for u in DEMO_USERS:
            username = u["username"]
            email = u["email"].lower()

            # 1. Check if user already exists
            existing = conn.execute(
                "SELECT id, username, email FROM users WHERE lower(username) = lower(?) OR lower(email) = ?",
                (username, email),
            ).fetchone()

            if existing:
                user_id = existing["id"]
                logger.info("User '%s' (%s) already exists. Updating profile & roles...", username, user_id)
                conn.execute(
                    """
                    UPDATE users
                    SET display_name = ?,
                        avatar_url = ?,
                        bio = ?,
                        role = ?,
                        is_verified = ?,
                        hashed_password = ?
                    WHERE id = ?
                    """,
                    (
                        u["display_name"],
                        u["avatar_url"],
                        u["bio"],
                        u["primary_role"],
                        u["is_verified"],
                        hashed_pwd,
                        user_id,
                    ),
                )
            else:
                user_id = str(uuid.uuid4())
                logger.info("Creating new user '%s' (%s) with role '%s'...", username, user_id, u["primary_role"])
                conn.execute(
                    """
                    INSERT INTO users (id, email, username, display_name, hashed_password, role, is_verified, avatar_url, bio, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        email,
                        username,
                        u["display_name"],
                        hashed_pwd,
                        u["primary_role"],
                        u["is_verified"],
                        u["avatar_url"],
                        u["bio"],
                        now_iso,
                    ),
                )

            # 2. Synchronize user_roles table
            # Clear existing roles and assign target roles to ensure clean tier assignment
            conn.execute("DELETE FROM user_roles WHERE user_id = ?", (user_id,))
            for role_name in u["roles"]:
                conn.execute(
                    """
                    INSERT INTO user_roles (user_id, role_name, granted_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, role_name) DO UPDATE SET
                        granted_at = excluded.granted_at
                    """,
                    (user_id, role_name, now_iso),
                )

            # 3. Synchronize user_credits table
            conn.execute(
                """
                INSERT INTO user_credits (user_id, balance, daily_allowance, last_claimed_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    balance = excluded.balance,
                    daily_allowance = excluded.daily_allowance,
                    updated_at = excluded.updated_at
                """,
                (user_id, u["balance"], u["daily_allowance"], now_iso, now_iso),
            )

            # 4. Ensure an API key exists for programmatic testing
            existing_key = conn.execute(
                "SELECT id FROM api_keys WHERE user_id = ? AND name = ?",
                (user_id, u["api_key_name"]),
            ).fetchone()

            raw_api_key = None
            if not existing_key:
                raw_api_key = f"st_live_{secrets.token_urlsafe(32)}"
                key_hash = hashlib.sha256(raw_api_key.encode("utf-8")).hexdigest()
                key_id = f"key_{uuid.uuid4().hex[:16]}"
                conn.execute(
                    """
                    INSERT INTO api_keys (id, user_id, key_hash, name, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (key_id, user_id, key_hash, u["api_key_name"], now_iso),
                )

            # Retrieve final user roles & permissions for verification
            assigned_roles = db.get_user_roles(user_id)
            perms = db.get_user_permissions(user_id)

            created_users.append(
                {
                    "id": user_id,
                    "username": username,
                    "email": email,
                    "display_name": u["display_name"],
                    "primary_role": u["primary_role"],
                    "roles": assigned_roles,
                    "permissions_count": len(perms),
                    "balance": u["balance"],
                    "daily_allowance": u["daily_allowance"],
                    "is_verified": bool(u["is_verified"]),
                    "password": DEFAULT_PASSWORD,
                    "api_key": raw_api_key,
                }
            )

    logger.info("Successfully seeded %d users across all role tiers!", len(created_users))
    return created_users


if __name__ == "__main__":
    results = seed_demo_users()
    print("\n" + "=" * 80)
    print("SEEDED USERS DIRECTORY")
    print("=" * 80)
    for r in results:
        print(f"Role: [{r['primary_role'].upper()}]")
        print(f"  Username     : {r['username']}")
        print(f"  Email        : {r['email']}")
        print(f"  Display Name : {r['display_name']}")
        print(f"  Password     : {r['password']}")
        print(f"  All Roles    : {r['roles']}")
        print(f"  Permissions  : {r['permissions_count']} primitives")
        print(f"  Credits      : {r['balance']} (Daily: {r['daily_allowance']})")
        print(f"  Verified     : {r['is_verified']}")
        if r['api_key']:
            print(f"  Generated Key: {r['api_key']}")
        print("-" * 80)
