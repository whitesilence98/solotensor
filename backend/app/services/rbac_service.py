"""SoloTensor Role-Based Access Control (RBAC) Service.

Provides hierarchical role resolution, granular permission checking,
in-memory TTL caching (5 minutes), cache invalidation on role changes,
and security audit logging.
"""

from datetime import datetime, timezone
import json
import logging
import time
from typing import Any, Optional, Set

from ..db import Database, get_db

logger = logging.getLogger("solotensor.rbac")

TIER_MAP = {
    "admin": 5,
    "moderator": 4,
    "verified_creator": 3,
    "pro_creator": 2,
    "creator": 1,
    "guest": 0,
}

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": [
        "generation:create_standard",
        "generation:create_pro",
        "generation:create_private",
        "generation:batch_multirun",
        "generation:delete_own",
        "generation:delete_any",
        "generation:complete_any",
        "model:publish",
        "model:download_weights",
        "model:edit_own",
        "model:edit_any",
        "model:delete_own",
        "model:delete_any",
        "model:install_vault",
        "tool:execute",
        "tool:publish",
        "tool:delete_own",
        "tool:delete_any",
        "credits:claim_daily",
        "credits:transfer",
        "credits:manage_billing",
        "credits:grant_manual",
        "moderation:flag_content",
        "moderation:review_queue",
        "moderation:ban_user",
        "moderation:inspect_telemetry",
        "agent:dispatch_jobs",
        "agent:sync_models",
        "agent:audit_safety",
    ],
    "moderator": [
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
        "generation:delete_any",
        "model:edit_any",
        "model:delete_any",
        "model:install_vault",
        "tool:delete_any",
        "moderation:review_queue",
        "moderation:ban_user",
        "moderation:inspect_telemetry",
    ],
    "verified_creator": [
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
        "generation:create_pro",
        "generation:create_private",
        "generation:batch_multirun",
        "credits:manage_billing",
    ],
    "pro_creator": [
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
        "generation:create_pro",
        "generation:create_private",
        "generation:batch_multirun",
        "credits:manage_billing",
    ],
    "creator": [
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
    ],
    "user": [
        "generation:create_standard",
        "generation:delete_own",
        "credits:claim_daily",
        "credits:transfer",
        "moderation:flag_content",
    ],
    "guest": [],
}



class RBACService:
    """In-memory TTL-cached Role-Based Access Control Service."""

    def __init__(self, db: Optional[Database] = None, ttl_seconds: int = 300) -> None:
        self.db = db or get_db()
        self.ttl = ttl_seconds
        self._roles_cache: dict[str, tuple[float, list[str]]] = {}
        self._perms_cache: dict[str, tuple[float, set[str]]] = {}

    def invalidate_user_cache(self, user_id: str) -> None:
        """Invalidate cached roles and permissions for a user."""
        self._roles_cache.pop(user_id, None)
        self._perms_cache.pop(user_id, None)

    def invalidate_all_cache(self) -> None:
        """Clear all in-memory caches."""
        self._roles_cache.clear()
        self._perms_cache.clear()

    async def get_user_roles(self, user_id: str) -> list[str]:
        """Fetch all active role names assigned to a user (with 5-minute cache)."""
        now = time.time()
        if user_id in self._roles_cache:
            exp, roles = self._roles_cache[user_id]
            if now < exp:
                return list(roles)

        roles = self.db.get_user_roles(user_id)
        self._roles_cache[user_id] = (now + self.ttl, roles)
        return list(roles)

    async def get_user_permissions(self, user_id: str) -> set[str]:
        """Fetch all granular permissions granted to a user (with 5-minute cache)."""
        now = time.time()
        if user_id in self._perms_cache:
            exp, perms = self._perms_cache[user_id]
            if now < exp:
                return set(perms)

        perms = self.db.get_user_permissions(user_id)
        self._perms_cache[user_id] = (now + self.ttl, perms)
        return set(perms)

    async def has_permission(self, user_id: str, permission: str) -> bool:
        """Check whether a user possesses the requested permission codename."""
        perms = await self.get_user_permissions(user_id)
        if "*" in perms or permission in perms:
            return True
        roles = await self.get_user_roles(user_id)
        if "admin" in roles:
            return True
        return False

    async def get_primary_role(self, user_id: str) -> str:
        """Return the highest tier role assigned to a user."""
        roles = await self.get_user_roles(user_id)
        if not roles:
            return "creator"
        return max(roles, key=lambda r: TIER_MAP.get(r, 1))

    async def assign_role(
        self,
        user_id: str,
        role_name: str,
        granted_by: Optional[str] = None,
        expires_at: Optional[str] = None,
    ) -> bool:
        """Assign or renew a role for a user and invalidate cache."""
        success = self.db.assign_user_role(
            user_id=user_id,
            role_name=role_name,
            granted_by=granted_by,
            expires_at=expires_at,
        )
        if success:
            self.invalidate_user_cache(user_id)
            await self.log_audit(
                actor_id=granted_by,
                action="role:assign",
                resource_type="user",
                resource_id=user_id,
                details={"role": role_name, "expires_at": expires_at},
            )
        return success

    async def revoke_role(
        self,
        user_id: str,
        role_name: str,
        revoked_by: Optional[str] = None,
    ) -> bool:
        """Revoke a role from a user and invalidate cache."""
        success = self.db.revoke_user_role(user_id=user_id, role_name=role_name)
        if success:
            self.invalidate_user_cache(user_id)
            await self.log_audit(
                actor_id=revoked_by,
                action="role:revoke",
                resource_type="user",
                resource_id=user_id,
                details={"role": role_name},
            )
        return success

    async def log_audit(
        self,
        actor_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: str,
        details: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> str:
        """Log a sensitive administrative or security action in security_audit_logs."""
        record = self.db.insert_audit_log(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        return record["id"]


_default_rbac_service: Optional[RBACService] = None


def get_rbac_service() -> RBACService:
    """Factory function for FastAPI Depends and global singleton."""
    global _default_rbac_service
    if _default_rbac_service is None:
        _default_rbac_service = RBACService()
    return _default_rbac_service


def set_rbac_service(service: Optional[RBACService]) -> None:
    """Setter for testing and runtime RBAC mock overrides."""
    global _default_rbac_service
    _default_rbac_service = service
