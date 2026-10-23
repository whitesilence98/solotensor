"""Security dependencies for SoloTensor Role-Based Access Control (RBAC).

Provides FastAPI dependencies for enforcing granular permissions and ownership checks.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status

from ..routers.auth import get_current_user
from ..schemas import UserResponse
from ..services.rbac_service import RBACService, get_rbac_service


class RequirePermission:
    """FastAPI dependency enforcing one or more permission codenames."""

    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions
        self.permission = permissions[0] if permissions else ""

    async def __call__(
        self,
        user: UserResponse = Depends(get_current_user),
        rbac: RBACService = Depends(get_rbac_service),
    ) -> UserResponse:
        for perm in self.permissions:
            if await rbac.has_permission(user.id, perm):
                return user
        if len(self.permissions) == 1:
            detail = f"PERMISSION_DENIED: Requires '{self.permission}'"
        else:
            detail = f"PERMISSION_DENIED: Requires one of {list(self.permissions)}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


class RequireAnyPermission:
    """FastAPI dependency enforcing at least one of the specified permissions."""

    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions

    async def __call__(
        self,
        user: UserResponse = Depends(get_current_user),
        rbac: RBACService = Depends(get_rbac_service),
    ) -> UserResponse:
        for perm in self.permissions:
            if await rbac.has_permission(user.id, perm):
                return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"PERMISSION_DENIED: Requires one of {list(self.permissions)}",
        )


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
