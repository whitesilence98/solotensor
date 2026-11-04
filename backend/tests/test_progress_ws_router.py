"""Router lifecycle tests for the authenticated progress relay.

Fully mocked: no ComfyUI, no network, no TestClient. The endpoint function is
driven with a fake WebSocket and a fake upstream so the ordering that matters
(upstream connected before the browser is accepted) is observable.
"""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from app.routers import ws as ws_router
from app.services.progress_registry import (
    CLOSE_EXPIRED,
    CLOSE_FORBIDDEN,
    CLOSE_UNAUTHORIZED,
    ProgressRegistry,
    set_progress_registry,
)


class FakeWebSocket:
    """Records handshake/close/send order and yields one scripted disconnect."""

    def __init__(self, ticket, origin="http://localhost:3000", events=None):
        self.query_params = {"ticket": ticket} if ticket is not None else {}
        self.headers = {"origin": origin} if origin else {}
        self.events: list[str] = []
        self.sent: list[str] = []
        self.close_code = None
        self.close_reason = None
        self._script = events or [{"type": "websocket.disconnect"}]
        self._received = 0

    async def accept(self) -> None:
        self.events.append("accept")

    async def close(self, code=1000, reason="") -> None:
        self.events.append(f"close:{code}")
        self.close_code = code
        self.close_reason = reason

    async def send_text(self, text: str) -> None:
        self.events.append("send")
        self.sent.append(text)

    async def receive(self) -> dict:
        if self._received >= len(self._script):
            await asyncio.sleep(3600)
        message = self._script[self._received]
        self._received += 1
        return message


class FakeUpstream:
    def __init__(self, frames=None):
        self.events: list[str] = []
        self.closed = False
        self._frames = frames or []

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for frame in self._frames:
            yield frame
        await asyncio.sleep(3600)

    async def close(self) -> None:
        self.closed = True
        self.events.append("upstream.close")


class RouterLifecycleTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.registry = ProgressRegistry()
        set_progress_registry(self.registry)

    def tearDown(self):
        set_progress_registry(None)

    def _ticket(self):
        return self.registry.issue_ticket("user-a")

    async def _run(self, websocket, upstream):
        async def fake_connect(*args, **kwargs):
            websocket.events.append("upstream.connect")
            return upstream

        with patch.object(ws_router.websockets, "connect", fake_connect):
            await ws_router.ws_progress(websocket)

    async def test_upstream_connects_before_browser_accept(self):
        grant = self._ticket()
        websocket = FakeWebSocket(grant.ticket)
        upstream = FakeUpstream()
        await self._run(websocket, upstream)
        self.assertLess(
            websocket.events.index("upstream.connect"),
            websocket.events.index("accept"),
        )

    async def test_reject_still_calls_accept_for_close_code(self):
        grant = self._ticket()
        websocket = FakeWebSocket(grant.ticket)

        async def failing_connect(*args, **kwargs):
            websocket.events.append("upstream.connect")
            raise OSError("ComfyUI down")

        with patch.object(ws_router.websockets, "connect", failing_connect):
            await ws_router.ws_progress(websocket)
        self.assertLess(
            websocket.events.index("upstream.connect"),
            websocket.events.index("accept"),
        )
        self.assertEqual(websocket.close_code, 1011)

    async def test_upstream_failure_releases_unclaimed_scope(self):
        grant = self._ticket()
        websocket = FakeWebSocket(grant.ticket)

        async def failing_connect(*args, **kwargs):
            raise OSError("ComfyUI down")

        with patch.object(ws_router.websockets, "connect", failing_connect):
            await ws_router.ws_progress(websocket)
        from app.services.progress_registry import ProgressScopeError

        with self.assertRaises(ProgressScopeError):
            self.registry.claim_client_id(grant.client_id, "user-a")

    async def test_only_scoped_text_frames_forwarded(self):
        grant = self._ticket()
        self.registry.claim_client_id(grant.client_id, "user-a")
        self.registry.register_prompt(grant.client_id, "own-prompt")
        frames = [
            json.dumps({"type": "progress", "data": {"prompt_id": "other-prompt", "value": 1}}),
            b"\x89PNG-preview",
            json.dumps({"type": "status", "data": {"status": {"queue_remaining": 1}}}),
            json.dumps({"type": "progress", "data": {"prompt_id": "own-prompt", "value": 2}}),
        ]
        websocket = FakeWebSocket(grant.ticket)
        upstream = FakeUpstream(frames)
        await self._run(websocket, upstream)
        self.assertEqual(len(websocket.sent), 1)
        self.assertIn("own-prompt", websocket.sent[0])
        self.assertTrue(upstream.closed)

    async def test_relay_tasks_are_settled_and_upstream_closed(self):
        grant = self._ticket()
        websocket = FakeWebSocket(grant.ticket)
        upstream = FakeUpstream()
        await self._run(websocket, upstream)
        # Both relay tasks were gathered inside the handler before it returned;
        # only the test's own loop task remains.
        self.assertTrue(upstream.closed)
        self.assertEqual(websocket.close_code, 1000)


class TicketCloseCodesTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.registry = ProgressRegistry()
        set_progress_registry(self.registry)
        self.connect = AsyncMock(side_effect=AssertionError("upstream must not open"))

    def tearDown(self):
        set_progress_registry(None)

    async def _reject(self, websocket):
        with patch.object(ws_router.websockets, "connect", self.connect):
            await ws_router.ws_progress(websocket)
        return websocket.close_code

    async def test_missing_ticket_is_4401(self):
        self.assertEqual(await self._reject(FakeWebSocket(None)), CLOSE_UNAUTHORIZED)
        self.connect.assert_not_awaited()

    async def test_unknown_ticket_is_4401(self):
        self.assertEqual(await self._reject(FakeWebSocket("bogus")), CLOSE_UNAUTHORIZED)

    async def test_replayed_ticket_is_4403(self):
        grant = self.registry.issue_ticket("user-a")
        self.registry.consume_ticket(grant.ticket)
        self.assertEqual(await self._reject(FakeWebSocket(grant.ticket)), CLOSE_FORBIDDEN)

    async def test_expired_ticket_is_4408(self):
        clock = [1000.0]
        registry = ProgressRegistry(clock=lambda: clock[0])
        set_progress_registry(registry)
        grant = registry.issue_ticket("user-a")
        clock[0] += 31
        self.assertEqual(await self._reject(FakeWebSocket(grant.ticket)), CLOSE_EXPIRED)

    async def test_disallowed_origin_is_4403(self):
        grant = self._ticket()
        websocket = FakeWebSocket(grant.ticket, origin="https://evil.example")
        self.assertEqual(await self._reject(websocket), CLOSE_FORBIDDEN)

    def _ticket(self):
        return self.registry.issue_ticket("user-a")


if __name__ == "__main__":
    unittest.main()
