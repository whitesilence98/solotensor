"""Unit tests for ComfyClient CLIP loader enum discovery (no live ComfyUI)."""

import unittest
from unittest.mock import MagicMock

import httpx

from app.services.comfy_client import ComfyClient, ComfyClientError


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = "" if status_code < 400 else "fake error body"

    async def aread(self):
        return b""

    def json(self):
        return self._payload


class _FakeHTTP:
    def __init__(self, client):
        self._client = client

    async def __aenter__(self):
        return self._client

    async def __aexit__(self, *exc_info):
        return False


class _FakeAsyncClient:
    """Mimics httpx.AsyncClient.get for /object_info/<class> only."""

    def __init__(self, mapping):
        self.mapping = mapping

    async def get(self, url):
        class_type = url.rsplit("/", 1)[-1]
        entry = self.mapping.get(class_type)
        if isinstance(entry, Exception):
            raise entry
        if entry is None:
            return _FakeResponse(status_code=500)
        return _FakeResponse({class_type: {"input": {"required": {"type": [entry]}}}})


class _FakeComfyClient(ComfyClient):
    def __init__(self, mapping):
        super().__init__(settings=MagicMock())
        self.mapping = mapping

    def _http(self):
        return _FakeHTTP(_FakeAsyncClient(self.mapping))


class ClipTypesTests(unittest.IsolatedAsyncioTestCase):
    async def test_clip_types_unions_both_loaders_clip_loader_first(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2", "ltxv"], "DualCLIPLoader": ["ltxv", "wan2"]}
        )
        self.assertEqual(await client.clip_types(), ["krea2", "ltxv", "wan2"])

    async def test_resolve_clip_type_accepts_video_only_protocol(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2"], "DualCLIPLoader": ["ltxv"]}
        )
        self.assertEqual(await client.resolve_clip_type("ltxv"), "ltxv")

    async def test_one_endpoint_failure_still_returns_the_other(self):
        client = _FakeComfyClient(
            {"CLIPLoader": ["krea2"], "DualCLIPLoader": httpx.ConnectError("down")}
        )
        self.assertEqual(await client.clip_types(), ["krea2"])

    async def test_both_endpoints_failing_raises(self):
        client = _FakeComfyClient(
            {
                "CLIPLoader": httpx.ConnectError("down"),
                "DualCLIPLoader": httpx.ReadTimeout("slow"),
            }
        )
        with self.assertRaises(ComfyClientError):
            await client.clip_types()


if __name__ == "__main__":
    unittest.main()
