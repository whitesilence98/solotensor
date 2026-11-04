"""Owner-scoped library collections.

Validation lives here: ownership, name handling, and asset keys. Asset keys are
re-validated against ``StorageService.get_asset`` (path containment) and must be
owned by the caller (sidecar ``user_id``). Reads filter out dangling items so a
deleted asset never surfaces as a collection member.
"""

import logging
from typing import Any, Optional

from ..db import Database, get_db
from ..schemas import (
    CollectionItemsAddRequest,
    CollectionItemsAddResponse,
    CollectionResponse,
    CollectionUpdateRequest,
)
from .storage import StorageError, StorageService, get_storage

logger = logging.getLogger("solotensor.service.collections")

MAX_KEYS = 100


class CollectionError(Exception):
    """Raised for invalid collection input (maps to HTTP 400/422)."""


class CollectionNotFoundError(Exception):
    """Raised when a collection is unknown or not owned by the caller (404)."""


class CollectionConflictError(Exception):
    """Raised when the (user_id, name) pair already exists (409)."""


class CollectionsService:
    def __init__(
        self,
        db: Optional[Database] = None,
        storage: Optional[StorageService] = None,
    ) -> None:
        self._db = db
        self._storage = storage

    @property
    def db(self) -> Database:
        return self._db if self._db is not None else get_db()

    @property
    def storage(self) -> StorageService:
        return self._storage if self._storage is not None else get_storage()

    # --- helpers -----------------------------------------------------------

    @staticmethod
    def _response(row: dict[str, Any]) -> CollectionResponse:
        return CollectionResponse(
            id=str(row["id"]),
            name=str(row["name"]),
            description=row.get("description"),
            item_count=int(row.get("item_count") or 0),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    @staticmethod
    def validate_key(key: str) -> str:
        """Reject traversal and absolute keys before touching storage."""
        clean = key.strip() if isinstance(key, str) else ""
        if not clean or len(clean) > 1024:
            raise CollectionError("Asset keys must be 1-1024 characters")
        if clean.startswith("/") or ".." in clean.split("/"):
            raise CollectionError("Asset key contains an illegal path segment")
        return clean

    def _owned_asset(self, user_id: str, key: str) -> bool:
        """True when the key resolves safely and its sidecar belongs to user_id."""
        try:
            item = self.storage.get_asset(key)
        except (StorageError, FileNotFoundError, ValueError):
            return False
        metadata = item.metadata or {}
        owner = metadata.get("user_id")
        return isinstance(owner, str) and owner == user_id

    def _require(self, user_id: str, collection_id: str) -> dict[str, Any]:
        row = self.db.get_collection(user_id, collection_id)
        if not row:
            raise CollectionNotFoundError("Collection not found")
        return row

    # --- operations --------------------------------------------------------

    def list_collections(self, user_id: str) -> list[CollectionResponse]:
        return [self._with_live_count(user_id, r) for r in self.db.list_collections(user_id)]

    def get_collection(self, user_id: str, collection_id: str) -> CollectionResponse:
        return self._with_live_count(user_id, self._require(user_id, collection_id))

    def _with_live_count(self, user_id: str, row: dict[str, Any]) -> CollectionResponse:
        """Count only members that still exist and belong to the caller."""
        if int(row.get("item_count") or 0) > 0:
            live = self.list_items(user_id, str(row["id"]))
            row = {**row, "item_count": len(live)}
        return self._response(row)

    def create_collection(
        self, user_id: str, name: str, description: Optional[str] = None
    ) -> CollectionResponse:
        row = self.db.create_collection(user_id, name, description)
        if not row:
            raise CollectionConflictError("A collection with that name already exists")
        return self._response(row)

    def update_collection(
        self, user_id: str, collection_id: str, req: CollectionUpdateRequest
    ) -> CollectionResponse:
        provided = req.model_fields_set
        if not provided:
            raise CollectionError("Provide a name or description to update")
        if "name" in provided and req.name is None:
            raise CollectionError("name must be a non-empty string, not null")
        status, row = self.db.update_collection(
            user_id,
            collection_id,
            name=req.name if "name" in provided else Database._UNSET,
            description=req.description if "description" in provided else Database._UNSET,
        )
        if status == "not_found":
            raise CollectionNotFoundError("Collection not found")
        if status == "conflict" or not row:
            raise CollectionConflictError("A collection with that name already exists")
        return self._response(row)

    def delete_collection(self, user_id: str, collection_id: str) -> bool:
        self._require(user_id, collection_id)
        return self.db.delete_collection(user_id, collection_id)

    def list_items(self, user_id: str, collection_id: str) -> list[str]:
        """Return only keys that still exist and are owned by the caller."""
        keys = self.db.list_collection_items(user_id, collection_id)
        if keys is None:
            raise CollectionNotFoundError("Collection not found")
        return [key for key in keys if self._owned_asset(user_id, key)]

    def add_items(
        self, user_id: str, collection_id: str, req: CollectionItemsAddRequest
    ) -> CollectionItemsAddResponse:
        self._require(user_id, collection_id)
        added: list[str] = []
        skipped: list[str] = []
        for key in req.keys:
            try:
                clean = self.validate_key(key)
            except CollectionError:
                skipped.append(key)
                continue
            if not self._owned_asset(user_id, clean):
                skipped.append(clean)
                continue
            added.append(clean)

        if not added:
            return CollectionItemsAddResponse(added=[], skipped=skipped)

        owned, inserted = self.db.add_collection_items(user_id, collection_id, added)
        if not owned:
            raise CollectionNotFoundError("Collection not found")
        inserted_set = set(inserted)
        skipped.extend([key for key in added if key not in inserted_set])
        return CollectionItemsAddResponse(added=inserted, skipped=skipped)

    def remove_item(self, user_id: str, collection_id: str, key: str) -> bool:
        try:
            clean = self.validate_key(key)
        except CollectionError:
            # Traversal/absolute keys are never members; report absent, not 400.
            self._require(user_id, collection_id)
            return False
        removed = self.db.remove_collection_item(user_id, collection_id, clean)
        if removed is None:
            raise CollectionNotFoundError("Collection not found")
        return bool(removed)


_service: Optional[CollectionsService] = None


def get_collections_service() -> CollectionsService:
    global _service
    if _service is None:
        _service = CollectionsService()
    return _service
