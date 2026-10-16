"""Security dependencies for SoloTensor Role-Based Access Control (RBAC).

Provides FastAPI dependencies for enforcing granular permissions and ownership checks.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status

from ..routers.auth import get_current_user
from ..schemas import UserResponse
from ..services.rbac_service import RBACService, get_rbac_service


class RequirePermission:
    """FastAPI dependency enforcing a specific permission codename."""

    def __init__(self, permission: str) -> None:
        self.permission = permission

    async def __call__(
        self,
        user: UserResponse = Depends(get_current_user),
        rbac: RBACService = Depends(get_rbac_service),
    ) -> UserResponse:
        has_perm = await rbac.has_permission(user.id, self.permission)
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"PERMISSION_DENIED: Requires '{self.permission}'",
            )
        return user


class RequireOwnerOrPermission:
    """Allows resource owners or users with a moderator/admin override permission."""

    def __init__(self, override_permission: str) -> None:
        self.override_permission = override_permission

    async def check(
        self,
        resource_owner_id: Optional[str],
        user: UserResponse,
        rbac: Optional[RBACService] = None,
    ) -> bool:
        """Check if user owns the resource or has the override permission."""
        if resource_owner_id is not None and str(user.id) == str(resource_owner_id):
            return True
        svc = rbac or get_rbac_service()
        return await svc.has_permission(user.id, self.override_permission)

    async def enforce(
        self,
        resource_owner_id: Optional[str],
        user: UserResponse,
        rbac: Optional[RBACService] = None,
    ) -> None:
        """Enforce ownership or override permission, raising 403 HTTP error if denied."""
        authorized = await self.check(resource_owner_id, user, rbac)
        if not authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"PERMISSION_DENIED: Requires ownership or '{self.override_permission}'",
            )
