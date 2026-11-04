"""Owner-scoped library collection routes.

Every endpoint requires authentication and scopes all reads/writes to the
caller. A collection owned by someone else is reported as 404, never 403, so
existence is not leaked.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies.permissions import get_current_user
from ..schemas import (
    CollectionCreateRequest,
    CollectionDeleteResponse,
    CollectionItemRemoveResponse,
    CollectionItemsAddRequest,
    CollectionItemsAddResponse,
    CollectionItemsResponse,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdateRequest,
    UserResponse,
)
from ..services.collections_service import (
    CollectionConflictError,
    CollectionError,
    CollectionNotFoundError,
    CollectionsService,
    get_collections_service,
)

logger = logging.getLogger("solotensor.router.collections")
router = APIRouter(tags=["collections"])

CollectionServiceDep = Depends(get_collections_service)
CurrentUserDep = Depends(get_current_user)


def _error(exc: Exception) -> HTTPException:
    if isinstance(exc, CollectionNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail="Collection not found")
    if isinstance(exc, CollectionConflictError):
        return HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=CollectionListResponse)
async def list_collections(
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionListResponse:
    return CollectionListResponse(items=service.list_collections(user.id))


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    req: CollectionCreateRequest,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionResponse:
    try:
        return service.create_collection(user.id, req.name, req.description)
    except (CollectionError, CollectionConflictError) as exc:
        raise _error(exc) from exc


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionResponse:
    try:
        return service.get_collection(user.id, collection_id)
    except CollectionNotFoundError as exc:
        raise _error(exc) from exc


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: str,
    req: CollectionUpdateRequest,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionResponse:
    try:
        return service.update_collection(user.id, collection_id, req)
    except (CollectionError, CollectionConflictError, CollectionNotFoundError) as exc:
        raise _error(exc) from exc


@router.delete("/{collection_id}", response_model=CollectionDeleteResponse)
async def delete_collection(
    collection_id: str,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionDeleteResponse:
    try:
        service.delete_collection(user.id, collection_id)
    except CollectionNotFoundError as exc:
        raise _error(exc) from exc
    return CollectionDeleteResponse(deleted=True, id=collection_id)


@router.get("/{collection_id}/items", response_model=CollectionItemsResponse)
async def list_collection_items(
    collection_id: str,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionItemsResponse:
    try:
        return CollectionItemsResponse(items=service.list_items(user.id, collection_id))
    except CollectionNotFoundError as exc:
        raise _error(exc) from exc


@router.post("/{collection_id}/items", response_model=CollectionItemsAddResponse)
async def add_collection_items(
    collection_id: str,
    req: CollectionItemsAddRequest,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionItemsAddResponse:
    try:
        return service.add_items(user.id, collection_id, req)
    except CollectionNotFoundError as exc:
        raise _error(exc) from exc


@router.delete("/{collection_id}/items/{key:path}", response_model=CollectionItemRemoveResponse)
async def remove_collection_item(
    collection_id: str,
    key: str,
    user: UserResponse = CurrentUserDep,
    service: CollectionsService = CollectionServiceDep,
) -> CollectionItemRemoveResponse:
    try:
        removed = service.remove_item(user.id, collection_id, key)
    except CollectionNotFoundError as exc:
        raise _error(exc) from exc
    except CollectionError as exc:
        raise _error(exc) from exc
    return CollectionItemRemoveResponse(removed=removed, key=key)
