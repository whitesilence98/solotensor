"""Migration script to assign all current assets and generations to user winnguyen282."""

import json
import logging
from pathlib import Path
from app.config import get_settings
from app.db import get_db
from app.services.storage import ASSET_EXTENSIONS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("migrate_assets")

TARGET_USERNAME = "winnguyen282"


def migrate():
    db = get_db()
    settings = get_settings()

    # 1. Fetch target user
    with db.get_connection() as conn:
        user = conn.execute(
            "SELECT id, username, email FROM users WHERE username = ?", (TARGET_USERNAME,)
        ).fetchone()

    if not user:
        logger.error("Target user '%s' not found in database!", TARGET_USERNAME)
        return

    target_user_id = user["id"]
    logger.info("Found target user: %s (ID: %s, Email: %s)", user["username"], target_user_id, user["email"])

    # 2. Migrate generations table
    with db.get_connection() as conn:
        cursor = conn.execute(
            "SELECT id, user_id, metadata_json FROM generations WHERE user_id IS NULL OR user_id != ?",
            (target_user_id,),
        )
        unassigned = cursor.fetchall()
        logger.info("Found %d generations in DB needing reassignment to %s", len(unassigned), TARGET_USERNAME)

        updated_count = 0
        for row in unassigned:
            gen_id = row["id"]
            meta = {}
            if row["metadata_json"]:
                try:
                    meta = json.loads(row["metadata_json"])
                except Exception:
                    pass
            meta["user_id"] = target_user_id

            conn.execute(
                "UPDATE generations SET user_id = ?, metadata_json = ? WHERE id = ?",
                (target_user_id, json.dumps(meta, ensure_ascii=False), gen_id),
            )
            updated_count += 1

        conn.commit()
        logger.info("Successfully updated %d generations in SQLite DB.", updated_count)

    # 3. Migrate disk assets sidecars
    storage_root = Path(settings.STORAGE_DIR).resolve()
    logger.info("Scanning storage directory: %s", storage_root)
    disk_assets = [p for p in storage_root.rglob("*") if p.suffix.lower() in ASSET_EXTENSIONS and p.is_file()]
    logger.info("Found %d asset files on disk", len(disk_assets))

    disk_updated = 0
    for asset_path in disk_assets:
        sidecar_path = asset_path.with_suffix(f"{asset_path.suffix}.json")
        meta = {}
        if sidecar_path.is_file():
            try:
                meta = json.loads(sidecar_path.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("Could not parse existing sidecar %s: %s", sidecar_path, exc)

        if meta.get("user_id") != target_user_id:
            meta["user_id"] = target_user_id
            sidecar_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
            disk_updated += 1

    logger.info("Successfully updated %d asset metadata sidecars on disk.", disk_updated)

    # 4. Final verification
    with db.get_connection() as conn:
        counts = conn.execute(
            "SELECT user_id, count(*) as count FROM generations GROUP BY user_id"
        ).fetchall()
        logger.info("Current DB breakdown by user: %s", [dict(c) for c in counts])

    logger.info("Asset migration to '%s' completed successfully!", TARGET_USERNAME)


if __name__ == "__main__":
    migrate()
