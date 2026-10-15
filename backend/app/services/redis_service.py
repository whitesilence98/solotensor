"""Phase 2 Redis service: connection pooling, job queue, and cache."""

import json
import logging
from typing import Any, Optional

from ..config import Settings, get_settings

logger = logging.getLogger("solotensor.redis")


class RedisService:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._client: Any = None
        self._in_memory_jobs: dict[str, dict[str, Any]] = {}
        self._in_memory_cache: dict[str, str] = {}

    @property
    def is_enabled(self) -> bool:
        return bool(self.settings.REDIS_URL and self.settings.REDIS_URL.strip())

    @property
    def client(self) -> Any:
        if not self.is_enabled:
            return None
        if self._client is None:
            try:
                import redis

                self._client = redis.from_url(
                    self.settings.REDIS_URL,
                    decode_responses=True,
                    socket_timeout=5.0,
                    socket_connect_timeout=5.0,
                )
                logger.info("Connected to Redis at %s", self.settings.REDIS_URL.split("@")[-1])
            except Exception as exc:
                logger.warning("Failed to connect to Redis: %s", exc)
                self._client = None
        return self._client

    def ping(self) -> bool:
        if not self.is_enabled:
            return False
        client = self.client
        if not client:
            return False
        try:
            return bool(client.ping())
        except Exception:
            return False

    def set_job_status(self, job_id: str, status: str, result: Optional[dict[str, Any]] = None, ttl: int = 3600) -> None:
        data = {"status": status, "result": result}
        payload = json.dumps(data)
        client = self.client
        if client:
            try:
                client.set(f"job:{job_id}", payload, ex=ttl)
                return
            except Exception as exc:
                logger.warning("Redis set_job_status failed: %s", exc)
        self._in_memory_jobs[job_id] = data

    def get_job_status(self, job_id: str) -> Optional[dict[str, Any]]:
        client = self.client
        if client:
            try:
                val = client.get(f"job:{job_id}")
                if val:
                    return json.loads(val)
            except Exception as exc:
                logger.warning("Redis get_job_status failed: %s", exc)
        return self._in_memory_jobs.get(job_id)

    def cache_set(self, key: str, value: str, ttl: int = 300) -> None:
        client = self.client
        if client:
            try:
                client.set(f"cache:{key}", value, ex=ttl)
                return
            except Exception:
                pass
        self._in_memory_cache[key] = value

    def cache_get(self, key: str) -> Optional[str]:
        client = self.client
        if client:
            try:
                return client.get(f"cache:{key}")
            except Exception:
                pass
        return self._in_memory_cache.get(key)


_redis_service: Optional[RedisService] = None


def get_redis_service(settings: Optional[Settings] = None) -> RedisService:
    global _redis_service
    if _redis_service is None:
        _redis_service = RedisService(settings=settings)
    return _redis_service
